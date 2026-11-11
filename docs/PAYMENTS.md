# Payments

Status as of 2026-10-02. **No adapter has been run against a live or sandbox merchant account from this codebase.** The adapters are written only from the vendors' published documentation, and they are unit-tested with recorded request/response shapes. Before taking real money, the operator must complete the sandbox checklist below.

## Rails

| Rail | State in code | Docs we verified | What is still missing |
|---|---|---|---|
| Cash on delivery | Working. The sub-order is marked paid when the merchant marks it delivered. | n/a | — |
| Qi Card | Adapter implemented: create payment, status, signed webhook. | https://developers-gate.qi.iq v2.0.4 (read 2026-10-02): Basic auth + `X-Terminal-Id`; `POST /payment`, `GET /payment/{id}/status`; webhook `X-Signature` = base64 RSA-SHA256 over `paymentId\|amount(3dp)\|currency\|creationDate\|status` | Merchant account, production host from the acquirer, webhook PEM key from Qi support, one sandbox run |
| ZainCash | Adapter implemented for the **v1** JWT flow: init → hosted pay page → signed return token → `transaction/get` re-check. | Official v1 docs dated 6 Mar 2023, read via the Wayback snapshot of 2025-07-16. ZainCash published a **v2** (OAuth2) in 2026, and that live page is behind a bot challenge. | Confirm with ZainCash that v1 is still accepted, or write a v2 adapter from verified v2 docs. Live credentials come by e-mail ("LIVE CREDENTIALS REQUEST"). |
| FIB, FastPay, AsiaPay | Shown in admin as "not integrated". | Public docs exist (links are in `UNIMPLEMENTED_GATEWAYS`). | Adapter, merchant account |
| Switch, Areeba Iraq | Shown as contract-only. | No public API reference for Iraq. | Contract |
| Test gateway (HMAC webhook) | Dev and test only. Production refuses to start if `PAYMENT_TEST_WEBHOOK_SECRET` is set. | n/a | — |

## Rules the code enforces

1. **The browser redirect is never proof of payment.**
   - The return route (`/api/v1/payments/{gateway}/return`) re-queries the gateway server-side before it changes anything.
   - Qi Card is also confirmed by its signed webhook.
2. **Signatures are verified, and the amount must match.**
   - Qi webhooks are verified with RSA-SHA256 using the operator's PEM key.
   - ZainCash tokens are verified as HS256 using the merchant secret. `alg` must be `HS256`; `none` is rejected and expiry is checked.
   - A correctly signed notification for the wrong amount marks the payment `failed`. It never marks it `paid`.
3. **Webhooks are idempotent.** Processing is keyed by `(provider, paymentId:status)` in `webhook_events`.
4. **References are bound together.** The ZainCash `orderid` must equal our reference, and the gateway transaction id must equal the one we stored. A retry replaces the stored reference, so a stale one can no longer mark an order paid.
5. **Merchants cannot fulfil unpaid online orders.** `confirmed`, `shipped` and `delivered` are refused with `awaiting_payment` until the payment is `paid`.
6. **No card data or wallet PINs ever reach this server.** Customers pay on the gateway's own hosted page.
7. **Redirect targets are fixed.** The server only redirects to `APP_ORIGIN` paths. The client only follows `https://` gateway URLs.
8. **Production refuses unsafe configuration:**
   - a sandbox Qi host;
   - `ZAINCASH_ENV` other than `live`;
   - Qi enabled without `QI_WEBHOOK_PUBLIC_KEY`;
   - the test-gateway secret.

## Sandbox checklist (operator)

1. **Configure Qi Card for the sandbox.**
   - Put the sandbox values in a **staging** environment only (`QI_API_BASE=https://uat-sandbox-3ds-api.qi.iq/api/v1`, plus the username, password and terminal from the Qi docs).
   - Ask Qi support for the webhook PEM key.
2. **Pay one Qi Card order with the published test card.** Confirm that:
   - the redirect works;
   - the webhook arrives;
   - the order shows "paid";
   - a duplicate webhook is ignored.
3. **Confirm ZainCash v1 is still offered.** If it is, run one payment with the test wallet from the docs. Otherwise replace the adapter with v2.
4. **Agree the money-flow terms with the gateways and record them in `docs/COMPLIANCE.md`:**
   - refund handling;
   - chargebacks;
   - the settlement account;
   - the receipt text.
5. **Get legal review of the terms of sale before live use.** This covers marketplace liability, returns and commission disclosure.

## Refunds

There is no automated refund call yet. Refunds are handled in the gateway's merchant dashboard, and the order is updated by an admin. Qi documents a refund API (`POST /payment/{id}/refund`), so it can be added once the sandbox run is done.
