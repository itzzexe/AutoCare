# Test report — 2026-10-02

Environment: Windows 11, Node 22.14, pnpm 10.12, Next.js 16.3.8, Vitest 5.0.3, Docker Desktop 27.5 (pgvector/pgvector:pg17, redis:7.4), Microsoft Edge (Chromium) via playwright-core 1.63, Ollama 0.14.1 on RTX 5060 Ti 8 GB.

This report separates **automated tests**, **manual/browser verification** and what has **not** been verified. No security audit or automotive expert review has taken place.

## 1. Automated integration suite (`apps/web/tests`)

| Run | Command | Result |
|---|---|---|
| Embedded PostgreSQL (PGlite) | `pnpm test` | **13 files, 127 tests passed** (2026-10-02, with the 2,530-code library and licensed-import tests) |
| Real PostgreSQL 17 + pgvector | `TEST_DATABASE_URL=postgres://…/autocare_test pnpm test` | **12 files, 123 tests passed** (2026-10-02) |
| Redis-backed rate limiting | `TEST_REDIS_URL=redis://… vitest run tests/auth.test.ts tests/http-security.test.ts` | **29 passed** — this run found and verified a fix for a real start-up bug (first requests hit the fail-closed path before the Redis connection was ready) |

Coverage by risk area:

| Area | File | What is asserted |
|---|---|---|
| Accounts & sessions | `auth.test.ts` | Argon2id storage; generic registration answer; strict schemas; login cookie flags; same error for wrong password/unknown e-mail; 429 + Retry-After; idle/absolute/revoked expiry; token hashed at rest; password change and role change revoke sessions; reset token single-use, hashed, expiring; TOTP enrolment rotates session and is enforced at login |
| HTTP security | `http-security.test.ts` | CSRF (missing, cross-session, foreign Origin, text/plain); webhook signature required; unknown fields 422; 413; malformed JSON/VIN; SQL-looking input harmless; error envelope without stack; bearer only for mobile sessions; CSP nonce/strict-dynamic, no unsafe-inline scripts; CORS allow-list; HTTPS redirect; header declarations; no `NEXT_PUBLIC_*`; client components cannot import server secrets |
| Isolation (IDOR/BOLA) | `isolation.test.ts` | Foreign vehicle/session → 404 for read/update/delete; share revocation by creator only; workshop-restricted shares; VIN never in responses or shares; role gates; MFA required for admin; reviewer sees no submitter identity, cannot self-review; merchant governorate scoping, anonymised RFQs, no cross-merchant product edits, no access to diagnostics; unapproved merchant blocked; workshop appointment isolation |
| Knowledge & providers | `knowledge.test.ts` | DTC formats (J2012, FTB, hex, legacy, reserved); extraction from Arabic text with Arabic-Indic digits and bidi marks; Arabic normalisation; VIN check digit; generic lookup; manufacturer codes never answered generically (no vehicle / other make / wrong year / match); uncovered hex code; source conflict; licence cache expiry; Iraqi part names; contract-only providers unused; licence expiry; outage; retry/backoff/429/circuit breaker |
| Diagnosis & AI | `diagnostics-ai.test.ts` | Safety rules (fuel smell, red lights, safety codes) and DIY suppression; monitor vs insufficient; check ordering; validator drops uncited causes, strips links/%, rejects extra fields; prompt fencing; private-runtime and cloud-model refusal; RAG licence and make filters; rules-only when AI disabled or unreachable; grounded answer with fenced injection attempt and rules-owned urgency; invalid JSON fallback; uncovered codes never sent to the model; retrieval restricted to covered codes; safety areas skip the model |
| Learning | `learning.test.ts` | Consent off by default; outdated consent text refused; de-identified copy (phone, VIN, name removed; month-only date; bucketed cost); verified-case retrieval and withdrawal removal; unreviewed cases never in KB; verifying requires a confirmed cause; duplicate flags; group-consistent splits; export only when approved; model activation needs approval + evaluation |
| Marketplace | `market.test.ts` | Fitment evidence ladder; server pricing, merchant split, idempotent replay, key reuse conflict; concurrent checkout oversell prevention (3 buyers, stock 1 — on PGlite and on real Postgres with a 10-connection pool); address required + encrypted; cancellation restores stock; return window; state machine; COD paid on delivery; reviews only after delivery and once; webhook signature/timestamp/duplicate/amount mismatch; RFQ one offer per merchant, landed-price sorting, offer in cart |
| Files & crypto | `files-crypto.test.ts` | HTML/SVG/ZIP rejected by magic bytes; quarantine when no scanner; with a clamd stand-in: re-encoded WebP without EXIF, signed URLs viewer-bound/expiring/tamper-evident; upload needs auth + CSRF + size cap; AES-GCM nonce uniqueness, AAD binding, tamper detection, key rotation; log scrubbing |
| Maintenance | `maintenance.test.ts` | Records, odometer only increases, due-by-date/odometer notifications once, isolation |
| Limiter outage | `ratelimit-failure.test.ts` | Redis down ⇒ login refused (fail closed), search still available |
| Licensed import | `kb-import.test.ts` | Refuses without licence policy; CSV quoting/CRLF; dry run; bad code and bad year rejected with line numbers; duplicates skipped; imported manufacturer code answered only for matching make/model/year; anonymous demand counter |
| External data | `integrations.test.ts` | NHTSA recall mapping and DD/MM/YYYY parsing; HTTP 400 = no recalls; not_configured vs unavailable; cache; owner isolation; vPIC model de-duplication and year guard |
| Billing & payments | `billing.test.ts` | Unpriced plans hidden; free plan price refused; vehicle limit lifted only after confirmed payment; renewal stacking; business-plan ownership; AI allowance; commission rate/base/void and Pro rate; sponsored label only while paying, allowance cap; featured workshops; HS256 tamper/none/expiry; Qi webhook RSA signature, amount mismatch, duplicate, fulfil-after-paid; ZainCash return token + server re-check + reference binding; production refuses sandbox/test gateways |

## 2. Browser end-to-end (`apps/web/e2e/smoke.mjs`)

| Target | Result |
|---|---|
| Dev server (`next dev`, PGlite), desktop 1366×900 + mobile 390×844 | **18/18 checks passed** |
| **Production mode** (`next build` + `next start`, `APP_ENV=production`, real Postgres via least-privilege `autocare_app`, Redis, Caddy TLS on `https://localhost:8443`) | **22/22 checks passed**: CSP with nonce, HSTS, `dir=rtl lang=ar`, skip link first in tab order, login, `__Host-` HttpOnly Secure session cookie, vehicle creation, LTR isolation of engine code, diagnosis wizard → rules-based urgency, Arabic PDF download, **zero console/page errors under the strict production CSP** |

Additional manual checks:

- Arabic PDF rendered and inspected: correct shaping, RTL tables, LTR codes and units; values localised.
- Light/dark and Arabic/English screenshots of home, search, code pages, coverage, garage, market, workshops, RFQ, diagnosis checks and result.
- `audit_events` as `autocare_app`: INSERT allowed; UPDATE, DELETE, TRUNCATE and CREATE TABLE denied (real Postgres).
- Client IP behind the TLS proxy recorded as a /24 prefix.
- NHTSA vPIC adapter live call with the public sample VIN `1HGCM82633A004352` → Honda Accord 2003, 3.0 L V6, `ErrorCode 0`.
- Backup/restore drill — see `BACKUP_RESTORE.md`.
- `next build` — compiled with no warnings.
- Automated accessibility audit (AccessLint, WCAG 2.x A/AA rules) on `/`, `/login`, `/register`, `/search`, `/codes/P0420`, `/codes/2A82`, `/market`, `/workshops`, `/coverage`: first pass found a missing `h1` on code and search pages and **insufficient contrast of the primary button (white on #d9480f, 3.9:1)** and of muted text (#7a766b). Fixed: signal colour → #b8390a, muted ink → #66625a, `h1` added. Re-audit: **no violations** on all nine pages. Pages behind login were not audited by this tool.
- `pnpm audit`: 0 high/critical; 1 moderate (esbuild ≤ 0.24 via `drizzle-kit` dev dependency, affects esbuild's dev server which is never run; not present in the runtime image) — recorded as an accepted exception in SECURITY.md §7.

Re-run 2026-10-02 after the KB, integrations and billing work:
- dev server (PGlite): **20/20**. On a free-plan account already at its vehicle limit, the run also confirmed the plan-limit message in the add-vehicle form.
- production mode behind TLS (Caddy, real Postgres + Redis, `APP_ENV=production`): **22/22**.
- Accessibility audit (axe-based AccessLint) of `/pricing`, `/guides`, `/guides/rough-idle`, `/codes?g=P03`: **0 violations**.
- Live NHTSA check: the vehicle page for a 2016 Toyota Corolla showed recall campaign 20V024000, with the US-market caveat.

## 3. AI evaluation

See `AI_EVALUATION.md` — synthetic, unreviewed case set only. llama3.1 was measured before and after the grounding gate; qwen3:8b was measured on 2026-10-02 (JSON 100%, citations 100%, Arabic share 0.86, 41.8 tok/s).

## 4. Not verified

- Automotive correctness of the knowledge base and rules (needs a qualified technician).
- AI quality on expert-reviewed cases; qwen3:8b measurements.
- Independent security testing (penetration test, code audit).
- CI workflow on a remote runner (no git remote configured); `pnpm audit`, gitleaks, Semgrep and Trivy have not been executed yet.
- Real e-mail delivery, real payments, ClamAV with real signatures (a protocol-compatible stand-in was used in tests), age-encrypted backups, production VPS.
- Screen-reader testing (NVDA/VoiceOver) and accessibility audit of authenticated pages.
- Mobile apps and OBD (not built).
