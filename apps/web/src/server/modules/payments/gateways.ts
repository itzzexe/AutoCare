import "server-only";
import { createHmac, createVerify, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env";
import { AppError } from "../../lib/errors";
import { providerFetch, resilientCall } from "../providers/resilience";

/**
 * Hosted-checkout payment gateways for Iraq. Each adapter is written only from
 * the vendor's published documentation (see docs/PAYMENTS.md for what was
 * verified and when) and stays "not_configured" until the operator supplies
 * merchant credentials. No adapter has been exercised against a live or
 * sandbox account from this codebase; run the sandbox checklist first.
 *
 * Money moves only through the customer's own redirect to the gateway page:
 * the server never handles card numbers or wallet PINs.
 */

export type GatewayId = "qi_card" | "zaincash";
export type GatewayPaymentStatus = "pending" | "paid" | "failed";

export interface CreatePaymentInput {
  /** Our reference (order id or subscription id). */
  reference: string;
  amountIqd: number;
  locale: "ar" | "en";
  /** Where the customer returns after paying. */
  returnUrl: string;
  /** Server-to-server notification URL (if the gateway supports one). */
  notifyUrl: string;
  serviceType: string;
}

export interface CreatePaymentResult {
  providerRef: string;
  redirectUrl: string;
}

export interface GatewayInfo {
  id: GatewayId;
  nameAr: string;
  nameEn: string;
  docsUrl: string;
  docsNote: string;
  minAmountIqd: number;
  configured(): boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  fetchStatus(providerRef: string): Promise<GatewayPaymentStatus>;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Minimal HS256 JWT (the only algorithm ZainCash v1 documents). */
export function signHs256(payload: Record<string, unknown>, secret: string): string {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export function verifyHs256(token: string, secret: string, now = Date.now()): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new AppError("bad_request", "jwt_malformed");
  const [h, p, s] = parts as [string, string, string];
  let header: { alg?: string };
  try {
    header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
  } catch {
    throw new AppError("bad_request", "jwt_malformed");
  }
  // Never accept "none" or asymmetric algorithms on an HMAC key.
  if (header.alg !== "HS256") throw new AppError("bad_request", "jwt_alg");
  const expected = createHmac("sha256", secret).update(`${h}.${p}`).digest();
  const got = Buffer.from(s, "base64url");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) throw new AppError("bad_request", "jwt_signature");
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    throw new AppError("bad_request", "jwt_malformed");
  }
  if (typeof payload.exp === "number" && payload.exp * 1000 < now - 60_000) throw new AppError("bad_request", "jwt_expired");
  return payload;
}

// ---------------------------------------------------------------------------
// Qi Card payment gateway — public docs https://developers-gate.qi.iq (v2.0.4),
// read 2026-10-02. Basic auth (username:password) + X-Terminal-Id header.
//   POST {base}/payment   { requestId, amount, currency, locale, finishPaymentUrl, notificationUrl }
//     -> { requestId, paymentId, status: CREATED|SUCCESS|FAILED|AUTHENTICATION_FAILED, formUrl, ... }
//   GET  {base}/payment/{paymentId}/status
// Webhook: X-Signature = base64 RSA-SHA256 over
//   "paymentId|amount(3 decimals)|currency|creationDate|status", verified with the PEM key from Qi support.
// The production host is issued by the acquirer; there is deliberately no default.
// ---------------------------------------------------------------------------
const qiStatus = (s: unknown): GatewayPaymentStatus => (s === "SUCCESS" ? "paid" : s === "FAILED" || s === "AUTHENTICATION_FAILED" ? "failed" : "pending");

function qiHeaders(): Record<string, string> {
  const e = env();
  return {
    authorization: `Basic ${Buffer.from(`${e.QI_USERNAME}:${e.QI_PASSWORD}`).toString("base64")}`,
    "x-terminal-id": e.QI_TERMINAL_ID!,
    accept: "application/json",
  };
}

export const qiCard: GatewayInfo = {
  id: "qi_card",
  nameAr: "كي كارد",
  nameEn: "Qi Card",
  docsUrl: "https://developers-gate.qi.iq",
  docsNote: "Public docs v2.0.4 read 2026-10-02 (create, status, refund, cancel, webhook RSA signature). Not exercised against the sandbox from this codebase.",
  minAmountIqd: 1,
  configured: () => {
    const e = env();
    return Boolean(e.QI_API_BASE && e.QI_USERNAME && e.QI_PASSWORD && e.QI_TERMINAL_ID);
  },
  async createPayment(input) {
    if (!this.configured()) throw new AppError("provider_not_configured", "qi_card");
    const base = env().QI_API_BASE!.replace(/\/$/, "");
    return resilientCall({ provider: "qi_card", timeoutMs: 15_000, retries: 0 }, async (signal) => {
      const res = await providerFetch(`${base}/payment`, {
        signal,
        method: "POST",
        headers: { ...qiHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          requestId: randomUUID(),
          amount: input.amountIqd,
          currency: "IQD",
          locale: input.locale === "ar" ? "ar_IQ" : "en_US",
          finishPaymentUrl: input.returnUrl,
          notificationUrl: input.notifyUrl,
          additionalInfo: { reference: input.reference, serviceType: input.serviceType },
        }),
      });
      const json = (await res.json()) as { paymentId?: unknown; formUrl?: unknown };
      if (typeof json.paymentId !== "string" || typeof json.formUrl !== "string" || !json.formUrl.startsWith("https://")) {
        throw new AppError("provider_unavailable", "qi_unexpected_response");
      }
      return { providerRef: json.paymentId, redirectUrl: json.formUrl };
    });
  },
  async fetchStatus(providerRef) {
    if (!this.configured()) throw new AppError("provider_not_configured", "qi_card");
    const base = env().QI_API_BASE!.replace(/\/$/, "");
    return resilientCall({ provider: "qi_card", timeoutMs: 10_000, retries: 1 }, async (signal) => {
      const res = await providerFetch(`${base}/payment/${encodeURIComponent(providerRef)}/status`, { signal, headers: qiHeaders() });
      const json = (await res.json()) as { status?: unknown; canceled?: unknown };
      return json.canceled === true ? "failed" : qiStatus(json.status);
    });
  },
};

export interface QiWebhookBody {
  paymentId: string;
  amount: number | string;
  currency: string;
  creationDate: string;
  status: string;
}

/** Verifies Qi's X-Signature over the documented field string. Returns the parsed body. */
export function verifyQiWebhook(rawBody: string, signature: string | null, publicKeyPem: string | undefined): QiWebhookBody & { mapped: GatewayPaymentStatus } {
  if (!publicKeyPem) throw new AppError("provider_not_configured", "qi_webhook_key");
  if (!signature) throw new AppError("unauthenticated", "missing_signature");
  let body: QiWebhookBody;
  try {
    body = JSON.parse(rawBody) as QiWebhookBody;
  } catch {
    throw new AppError("bad_request", "invalid_json");
  }
  if (typeof body.paymentId !== "string" || body.amount == null || typeof body.currency !== "string" || typeof body.creationDate !== "string" || typeof body.status !== "string") {
    throw new AppError("bad_request", "missing_fields");
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount)) throw new AppError("bad_request", "bad_amount");
  const signed = `${body.paymentId}|${amount.toFixed(3)}|${body.currency}|${body.creationDate}|${body.status}`;
  const ok = createVerify("RSA-SHA256").update(signed).verify(publicKeyPem, signature, "base64");
  if (!ok) throw new AppError("unauthenticated", "bad_signature");
  return { ...body, mapped: qiStatus(body.status) };
}

// ---------------------------------------------------------------------------
// ZainCash — v1 JWT flow, from the official docs "Version 1.0, updated 6 Mar 2023"
// (docs.zaincash.iq, archived snapshot 2025-07-16). ZainCash has since published
// a v2 (OAuth2) API; v1 availability in 2026 is NOT confirmed. Confirm with
// ZainCash before enabling, or replace with a v2 adapter once its docs are verified.
//   POST {host}/transaction/init  (form: token, merchantId, lang) -> { id }
//     token = HS256(secret){ amount, serviceType, msisdn, orderId, redirectUrl, iat, exp }
//   customer -> {host}/transaction/pay?id={id}
//   return  -> redirectUrl?token=HS256(secret){ status, orderid, id, msg? }
//   POST {host}/transaction/get   (form: token{ id, msisdn, iat, exp }, merchantId)
// The docs disagree on the minimum (250 vs "more than 1000" IQD): 1000 is enforced.
// ---------------------------------------------------------------------------
const ZC_HOSTS = { test: "https://test.zaincash.iq", live: "https://api.zaincash.iq" } as const;
const zcHost = () => ZC_HOSTS[env().ZAINCASH_ENV];
const zcStatus = (s: unknown): GatewayPaymentStatus => (s === "success" || s === "completed" ? "paid" : s === "failed" ? "failed" : "pending");

export const zainCash: GatewayInfo = {
  id: "zaincash",
  nameAr: "زين كاش",
  nameEn: "ZainCash",
  docsUrl: "https://docs.zaincash.iq",
  docsNote: "v1 JWT flow per 2023 docs (archived 2025-07-16). v2 exists (2026); v1 availability unconfirmed. Not exercised against the test host from this codebase.",
  minAmountIqd: 1000,
  configured: () => {
    const e = env();
    return Boolean(e.ZAINCASH_MERCHANT_ID && e.ZAINCASH_SECRET && e.ZAINCASH_MSISDN);
  },
  async createPayment(input) {
    if (!this.configured()) throw new AppError("provider_not_configured", "zaincash");
    if (input.amountIqd < this.minAmountIqd) throw new AppError("bad_request", "amount_below_gateway_minimum");
    const e = env();
    const iat = Math.floor(Date.now() / 1000);
    const token = signHs256(
      { amount: input.amountIqd, serviceType: input.serviceType.slice(0, 100), msisdn: e.ZAINCASH_MSISDN, orderId: input.reference, redirectUrl: input.returnUrl, iat, exp: iat + 4 * 3600 },
      e.ZAINCASH_SECRET!,
    );
    return resilientCall({ provider: "zaincash", timeoutMs: 15_000, retries: 0 }, async (signal) => {
      const res = await providerFetch(`${zcHost()}/transaction/init`, {
        signal,
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({ token, merchantId: e.ZAINCASH_MERCHANT_ID!, lang: input.locale }).toString(),
      });
      const json = (await res.json()) as { id?: unknown };
      if (typeof json.id !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(json.id)) throw new AppError("provider_unavailable", "zaincash_unexpected_response");
      return { providerRef: json.id, redirectUrl: `${zcHost()}/transaction/pay?id=${encodeURIComponent(json.id)}` };
    });
  },
  async fetchStatus(providerRef) {
    if (!this.configured()) throw new AppError("provider_not_configured", "zaincash");
    const e = env();
    const iat = Math.floor(Date.now() / 1000);
    const token = signHs256({ id: providerRef, msisdn: e.ZAINCASH_MSISDN, iat, exp: iat + 3600 }, e.ZAINCASH_SECRET!);
    return resilientCall({ provider: "zaincash", timeoutMs: 10_000, retries: 1 }, async (signal) => {
      const res = await providerFetch(`${zcHost()}/transaction/get`, {
        signal,
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({ token, merchantId: e.ZAINCASH_MERCHANT_ID! }).toString(),
      });
      const json = (await res.json()) as { status?: unknown };
      return zcStatus(json.status);
    });
  },
};

/** Decodes the token ZainCash appends to the redirect URL. Signature is checked; status is re-confirmed server-side by the caller. */
export function verifyZainCashReturn(token: string): { providerRef: string; reference: string; status: GatewayPaymentStatus; message: string | null } {
  const secret = env().ZAINCASH_SECRET;
  if (!secret) throw new AppError("provider_not_configured", "zaincash");
  const p = verifyHs256(token, secret);
  if (typeof p.id !== "string" || typeof p.orderid !== "string") throw new AppError("bad_request", "zaincash_token_fields");
  return { providerRef: p.id, reference: p.orderid, status: zcStatus(p.status), message: typeof p.msg === "string" ? p.msg.slice(0, 200) : null };
}

export const GATEWAYS: Record<GatewayId, GatewayInfo> = { qi_card: qiCard, zaincash: zainCash };

/**
 * Other Iraqi rails we checked (2026-10-02). Listed in admin so the operator
 * knows the state; no adapter until docs and a merchant account are in hand.
 */
export const UNIMPLEMENTED_GATEWAYS = [
  { id: "fib", name: "First Iraqi Bank (FIB)", docsUrl: "https://fib.iq/integrations/web-payments/", note: "Public docs (OAuth2 + payments). Adapter not written yet." },
  { id: "fastpay", name: "FastPay", docsUrl: "https://documenter.getpostman.com/view/19338260/2s9YkkeNKN", note: "Official Postman collection; base URLs only from a third-party SDK. Adapter not written." },
  { id: "asiapay", name: "AsiaPay (Asiacell)", docsUrl: "https://www.asiapay.iq/integration", note: "Public docs; sandbox credentials from support only. Adapter not written." },
  { id: "switch", name: "Switch", docsUrl: "https://switch.com.iq", note: "No public API reference found. Contract-only." },
  { id: "areeba", name: "Areeba Iraq", docsUrl: "https://areeba.com", note: "Iraq platform differs from the public Lebanon docs. Contract-only." },
] as const;

export function gatewayStatuses() {
  return [
    ...Object.values(GATEWAYS).map((g) => ({ id: g.id, name: g.nameEn, state: g.configured() ? "configured" : "not_configured", docsUrl: g.docsUrl, note: g.docsNote })),
    ...UNIMPLEMENTED_GATEWAYS.map((g) => ({ id: g.id, name: g.name, state: "not_implemented", docsUrl: g.docsUrl, note: g.note })),
  ];
}

export function availableGateways(): GatewayInfo[] {
  return Object.values(GATEWAYS).filter((g) => g.configured());
}
