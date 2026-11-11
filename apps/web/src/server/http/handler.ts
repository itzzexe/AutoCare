import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import { env } from "../config/env";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { rateLimit, type PolicyName } from "../lib/rate-limit";
import { clientIp, ipPrefix, sameOriginRequest } from "../lib/request";
import { CSRF_COOKIE, CSRF_HEADER, verifyCsrfToken } from "../modules/identity/csrf";
import type { Permission } from "../modules/identity/rbac";
import { PRIVILEGED_ROLES } from "../modules/identity/rbac";
import { SESSION_COOKIE, validateSessionToken, type AuthContext } from "../modules/identity/sessions";

/**
 * Wrapper used by every /api/v1 route handler. Order of checks:
 *   size limit → origin/CSRF (unsafe methods) → auth → permission/MFA/reauth
 *   → rate limit → schema validation → handler (with time budget) → safe errors.
 */

type CookieOp = { name: string; value: string; options: Record<string, unknown> };

export interface Ctx<B, Q, P, A = AuthContext | null> {
  req: NextRequest;
  requestId: string;
  ip: string;
  ipPrefix: string | null;
  auth: A;
  body: B;
  query: Q;
  params: P;
  setCookie: (name: string, value: string, options: Record<string, unknown>) => void;
  signal: AbortSignal;
}
export type AuthedCtx<B, Q, P> = Ctx<B, Q, P, AuthContext>;

interface Options<B extends ZodType | undefined, Q extends ZodType | undefined, P extends ZodType | undefined> {
  permission?: Permission;
  /** Require a password/TOTP re-authentication within REAUTH_WINDOW_MINUTES. */
  reauth?: boolean;
  body?: B;
  query?: Q;
  params?: P;
  rateLimit?: Array<{ policy: PolicyName; by: "ip" | "user" }>;
  maxBodyBytes?: number;
  timeoutMs?: number;
  /** Webhooks authenticate by signature and are exempt from cookie CSRF. */
  csrf?: boolean;
  /** Raw body: "text" (webhooks, signature over exact bytes) or "binary" (file uploads). */
  rawBody?: "text" | "binary";
}

type Infer<T> = T extends ZodType ? z.output<T> : undefined;
type AnyHandler = (ctx: Ctx<unknown, unknown, unknown, AuthContext | null>) => Promise<unknown>;

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function errorResponse(e: AppError, requestId: string): NextResponse {
  const res = NextResponse.json(
    {
      error: {
        code: e.code,
        message: e.status >= 500 && e.code === "internal" ? "internal_error" : e.message,
        requestId,
        ...(e.extra?.fields ? { fields: e.extra.fields } : {}),
        ...(e.extra?.retryAfterSeconds ? { retryAfterSeconds: e.extra.retryAfterSeconds } : {}),
      },
    },
    { status: e.status },
  );
  if (e.extra?.retryAfterSeconds) res.headers.set("Retry-After", String(e.extra.retryAfterSeconds));
  return res;
}

function zodFields(err: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.code === "custom" ? issue.message : issue.code);
  }
  return out;
}

async function readBody(req: NextRequest, max: number): Promise<Buffer> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > max) throw new AppError("payload_too_large");
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new AppError("payload_too_large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function resolveAuth(req: NextRequest): Promise<AuthContext | null> {
  const bearer = req.headers.get("authorization");
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    const ctx = await validateSessionToken(bearer.slice(7).trim());
    // Bearer tokens are only valid for sessions issued to native (mobile) clients.
    return ctx && ctx.client === "mobile" ? ctx : null;
  }
  const token = req.cookies.get(SESSION_COOKIE())?.value;
  if (!token) return null;
  const ctx = await validateSessionToken(token);
  return ctx && ctx.client === "web" ? ctx : null;
}

/** Authenticated endpoint: `ctx.auth` is always present. */
export function route<B extends ZodType | undefined = undefined, Q extends ZodType | undefined = undefined, P extends ZodType | undefined = undefined>(
  opts: Options<B, Q, P>,
  handler: (ctx: AuthedCtx<Infer<B>, Infer<Q>, Infer<P>>) => Promise<unknown>,
) {
  return build(opts, "required", handler as AnyHandler);
}

/** Endpoint usable without login (`ctx.auth` may be null). */
export function publicRoute<B extends ZodType | undefined = undefined, Q extends ZodType | undefined = undefined, P extends ZodType | undefined = undefined>(
  opts: Options<B, Q, P> & { auth?: "optional" | "none" },
  handler: (ctx: Ctx<Infer<B>, Infer<Q>, Infer<P>>) => Promise<unknown>,
) {
  if (opts.permission) throw new Error("publicRoute cannot require a permission");
  return build(opts, opts.auth ?? "optional", handler as AnyHandler);
}

function build(opts: Options<ZodType | undefined, ZodType | undefined, ZodType | undefined>, authMode: "required" | "optional" | "none", handler: AnyHandler) {
  return async (req: NextRequest, routeCtx: { params: Promise<Record<string, string | string[]>> }) => {
    const requestId = randomUUID();
    const ip = clientIp(req.headers);
    const cookieOps: CookieOp[] = [];
    const started = Date.now();
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    try {
      const unsafe = UNSAFE.has(req.method);
      const isBearer = req.headers.get("authorization")?.toLowerCase().startsWith("bearer ") ?? false;

      // Origin check applies to every cookie-based unsafe request (incl. anonymous login/register).
      if (unsafe && opts.csrf !== false && !isBearer && !sameOriginRequest(req.headers)) {
        throw new AppError("csrf_failed", "origin_mismatch");
      }

      const raw = unsafe || opts.rawBody ? await readBody(req, opts.maxBodyBytes ?? 64 * 1024) : Buffer.alloc(0);

      const auth = authMode === "none" ? null : await resolveAuth(req);
      if (authMode === "required" && !auth) throw new AppError("unauthenticated");

      if (unsafe && opts.csrf !== false && !isBearer) {
        const binding = auth?.sessionId ?? "anon";
        if (!verifyCsrfToken(binding, req.headers.get(CSRF_HEADER), req.cookies.get(CSRF_COOKIE())?.value)) {
          throw new AppError("csrf_failed");
        }
      }

      if (opts.permission) {
        if (!auth!.permissions.has(opts.permission)) throw new AppError("forbidden");
        const privileged = auth!.user.roles.some((r) => PRIVILEGED_ROLES.includes(r));
        if (privileged && !auth!.mfaVerified && opts.permission.match(/^(admin|cases|knowledge|moderation):/)) {
          throw new AppError("mfa_required", auth!.user.mfaEnabled ? "mfa_verification_required" : "mfa_enrollment_required");
        }
      }
      if (opts.reauth) {
        const windowMs = env().REAUTH_WINDOW_MINUTES * 60_000;
        if (!auth!.reauthAt || Date.now() - auth!.reauthAt.getTime() > windowMs) throw new AppError("reauth_required");
      }

      for (const rl of opts.rateLimit ?? []) {
        const key = rl.by === "user" ? (auth?.user.id ?? `ip:${ip}`) : ip;
        await rateLimit(rl.policy, key);
      }

      let body: unknown = undefined;
      if (opts.rawBody === "binary") body = raw;
      else if (opts.rawBody === "text") body = raw.toString("utf8");
      else if (opts.body) {
        // JSON only: rejects text/plain & form posts that a cross-site page could send without preflight.
        if (raw.length && !(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
          throw new AppError("unsupported_media_type");
        }
        let json: unknown;
        try {
          json = raw.length ? JSON.parse(raw.toString("utf8")) : {};
        } catch {
          throw new AppError("bad_request", "invalid_json");
        }
        const parsed = opts.body.safeParse(json);
        if (!parsed.success) throw new AppError("validation_failed", "validation_failed", { fields: zodFields(parsed.error) });
        body = parsed.data;
      }
      let query: unknown = undefined;
      if (opts.query) {
        const parsed = opts.query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
        if (!parsed.success) throw new AppError("validation_failed", "validation_failed", { fields: zodFields(parsed.error) });
        query = parsed.data;
      }
      let params: unknown = undefined;
      if (opts.params) {
        const parsed = opts.params.safeParse(await routeCtx.params);
        if (!parsed.success) throw new AppError("not_found");
        params = parsed.data;
      }

      const ctx: Ctx<unknown, unknown, unknown, AuthContext | null> = {
        req,
        requestId,
        ip,
        ipPrefix: ipPrefix(ip),
        auth,
        body,
        query,
        params,
        signal: controller.signal,
        setCookie: (name, value, options) => cookieOps.push({ name, value, options }),
      };

      const budget = opts.timeoutMs ?? 15_000;
      const result = await Promise.race([
        handler(ctx),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new AppError("internal", "timeout"));
          }, budget);
        }),
      ]);

      const res = result instanceof Response ? (result as NextResponse) : NextResponse.json(result ?? { ok: true });
      for (const c of cookieOps) (res as NextResponse).cookies.set(c.name, c.value, c.options);
      res.headers.set("Cache-Control", "no-store");
      res.headers.set("X-Request-Id", requestId);
      return res;
    } catch (err) {
      const e = err instanceof AppError ? err : new AppError("internal");
      if (!(err instanceof AppError)) {
        logger.error({ requestId, path: req.nextUrl.pathname, err: (err as Error)?.stack ?? String(err) }, "unhandled api error");
      } else if (e.status >= 500) {
        logger.warn({ requestId, path: req.nextUrl.pathname, code: e.code, msg: e.message }, "api error");
      }
      const res = errorResponse(e, requestId);
      res.headers.set("Cache-Control", "no-store");
      return res;
    } finally {
      if (timer) clearTimeout(timer);
      logger.debug({ requestId, method: req.method, path: req.nextUrl.pathname, ms: Date.now() - started }, "api");
    }
  };
}

/** Path params schemas reused by many routes. */
export const IdParams = z.object({ id: z.uuid() });
