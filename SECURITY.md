# Security

This document describes the controls that are **implemented and tested**, the ones that depend on deployment, and the risks that remain. It is not a certification. No independent penetration test or audit has been performed yet, and nothing here claims "100% security".

Report vulnerabilities privately to the security owner (placeholder: `security@example.org` — replace before launch). Do not open public issues for vulnerabilities.

## 1. Threat model (summary)

**Assets:** account credentials and sessions; vehicle identity (VIN), delivery addresses and phone numbers; diagnostic sessions and repair cases (personal and, for verified cases, research value); merchant/workshop business data; licensed provider content and API keys; the knowledge base and model behaviour (integrity — wrong repair advice can hurt people); orders and payments.

**Actors:** anonymous internet users and bots; authenticated owners attempting horizontal access (IDOR/BOLA); malicious or fraudulent merchants; compromised workshop staff; insiders with admin roles; prompt-injection authors (through symptoms text, uploaded files or poisoned case submissions); supply-chain attackers (dependencies, container images).

| STRIDE | Main threats | Primary controls |
|---|---|---|
| Spoofing | credential stuffing, session theft, login CSRF | Argon2id, per-account + per-IP limits, generic errors, HttpOnly/SameSite cookies, `__Host-` prefix in prod, TOTP MFA (mandatory for privileged roles), Origin check + CSRF on login |
| Tampering | price/stock manipulation, webhook forgery, knowledge poisoning | Server-side pricing, atomic conditional stock updates, HMAC-signed webhooks with timestamp + amount checks, case review workflow, licence-gated sources |
| Repudiation | admin abuse, disputed orders | Append-only (DB-grant enforced) audit log with request ids; order status history |
| Information disclosure | IDOR, cross-tenant leaks, logs, LLM leakage | Ownership in every query (404 on foreign ids), anonymised merchant views, field encryption, log redaction, per-request model context with only the user's own data |
| Denial of service | AI cost exhaustion, large uploads, search floods | Rate limits per op, daily AI quota, inference concurrency/queue caps, body/upload caps, time budgets |
| Elevation of privilege | role escalation, mass assignment | Static RBAC map, strict schemas (unknown fields rejected), role changes require MFA + reauth and revoke target sessions |

## 2. Controls by required item

| Required item | Implementation | Evidence (tests) |
|---|---|---|
| **Input Validation** | zod `strictObject` on every body/query/path (`packages/contracts/src/schemas.ts`, `server/http/handler.ts`); JSON content-type required; length/count/size bounds; VIN/DTC/OE parsers | `http-security.test.ts` (unknown fields, 413, 415, malformed JSON/VIN) |
| **Sanitize user input** | Validation ≠ normalisation ≠ output encoding. Search keys are normalised separately (`text.ts`) without altering stored Arabic; invisible bidi/zero-width marks stripped from identifiers; model output stripped of links/percentages; free text scrubbed of PII before the learning copy | `knowledge.test.ts` (Arabic normalisation, bidi marks), `learning.test.ts` (PII scrubbing), `diagnostics-ai.test.ts` |
| **SQL Injection** | Drizzle ORM with bound parameters everywhere; the only `sql.raw` uses are constant table names (admin counts) and array syntax; tsquery built from letter/digit tokens and passed as a parameter; LIKE wildcards escaped; least-privilege DB role (`ops/sql/roles.sql`) | `http-security.test.ts` (SQL-looking search) |
| **XSS** | React escaping; no `dangerouslySetInnerHTML` anywhere (QR code rendered as `data:` image); nonce-based CSP with `strict-dynamic`, no `unsafe-inline` scripts in prod; PDF HTML built with an escaping helper and rendered with JS disabled; notification links restricted to internal relative paths; files served with `nosniff`, `sandbox` CSP, PDFs as attachments | `http-security.test.ts` (CSP), `files-crypto.test.ts` (HTML/SVG rejected) |
| **CSRF protection** | Signed double-submit token bound to the session id (`identity/csrf.ts`) + Origin/Sec-Fetch-Site check; no state change via GET; bearer clients exempt (no ambient credentials); webhooks authenticated by HMAC | `http-security.test.ts` (missing token, cross-session token, foreign Origin, text/plain) |
| **Hash Passwords** | Argon2id (`@node-rs/argon2`), m=19 MiB, t=2, p=1 (OWASP minimum), unique salt in PHC string, rehash-on-login when parameters rise, ≥12 chars + common-password block; `pnpm bench:argon2` to tune per server | `auth.test.ts` |
| **Sessions Expiration** | Server-side sessions, token hashed at rest; idle 3 days sliding / absolute 30 days (owners), idle 30 min / absolute 12 h (privileged roles); new id on login, MFA enrolment and privilege change; revoked on logout, password change/reset, role change, account deletion; device list + revoke | `auth.test.ts`, `isolation.test.ts` |
| **Rate Limiting** | `rate-limiter-flexible` with Redis (required in prod); separate policies for login (IP + account), reset, register, verify, MFA, search, VIN decode, AI, upload, RFQ, orders, writes, share links, webhooks; 429 + `Retry-After`; sensitive policies fail **closed** if Redis is down, read/search fail open to an in-process limiter | `auth.test.ts` (429 + Retry-After) |
| **file upload security** | Size cap while streaming; magic-byte detection (`file-type`); allow-list JPEG/PNG/WebP/PDF; random storage keys outside the web root; quarantine → ClamAV INSTREAM → clean; no scanner ⇒ `scan_unavailable` (never served); sharp re-encode drops EXIF/GPS and appended data with pixel limits; PDFs never parsed server-side; HMAC-signed, viewer-bound, 5-minute URLs plus a fresh ownership check | `files-crypto.test.ts` |
| **Security Headers** | CSP with per-request nonce (`src/proxy.ts`), `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo/payment/usb/bluetooth off), COOP/CORP; API responses `default-src 'none'`; `poweredByHeader: false` | `http-security.test.ts` |
| **CORS Config** | Explicit per-environment allow-list (`APP_ORIGIN` + `CORS_ALLOWED_ORIGINS`); never `*`; credentials only for allow-listed origins; preflight 403 otherwise. CORS is not used as an auth control | `http-security.test.ts` |
| **Enforce HTTPS everywhere** | Caddy terminates TLS and redirects port 80; app redirects `x-forwarded-proto: http` (308) in prod; `Secure` + `__Host-` cookies in prod; HSTS via `HSTS_ENABLED` after the domain is verified; `APP_ORIGIN` must be https in prod (start-up guard). Localhost is the only explicit HTTP exception (development) | `http-security.test.ts` (redirect) |
| **Do not expose API keys** | Provider calls only from the server; keys read from server config only; no `NEXT_PUBLIC_*` usage; client components may not import server config/crypto (test); keys never logged (redaction) | `http-security.test.ts` (bundle guard tests) |
| **.env variables** | `.env.local` only for development (generated by `pnpm env:init`, git-ignored); `.env.example` without secrets; production uses the secret manager / root-owned files mounted at runtime; config validated at start-up, reporting variable *names* only | `config/env.ts` |
| **Rotate secrets** | See §4. Field encryption is key-id versioned; `pnpm keys:reencrypt` migrates envelopes; session/CSRF/file-URL secrets rotate by replacement (invalidates outstanding tokens) | `files-crypto.test.ts` (rotation) |
| **Scan Dependencies** | CI: `pnpm audit --audit-level high`, gitleaks (secrets), Semgrep (SAST), Trivy (image, fixable HIGH/CRITICAL fail the build), CycloneDX SBOM; lockfile frozen installs | `.github/workflows/ci.yml` |
| **Flag Risks** | §5 risk register below | — |
| **Applicable Compliance** | `docs/COMPLIANCE.md` | — |

### Further controls

- **Encryption at rest (application level):** AES-256-GCM via `node:crypto` with 96-bit random IVs, key ids and AAD binding each ciphertext to its row/column (VIN, phone numbers, delivery addresses, TOTP secrets, outbox payloads). This is **not** end-to-end encryption: the server must read these values to provide the service. Disk/volume and backup encryption are deployment controls (§3).
- **SSRF:** the server never fetches user-supplied URLs. Provider calls go to fixed, allow-listed hosts with `redirect: "error"`. The Ollama URL must resolve to loopback/private address space. Image import from URLs is intentionally not offered.
- **AI isolation:** the model has no tools, no SQL, no shell, no network and no secrets. It sees only the requesting user's session data plus licensed documents. User text is fenced as `<untrusted>`; output must match a JSON schema and may cite only retrieved refs. Urgency is never taken from model output. Uncovered codes and safety-critical areas are not sent to the model.
- **Network exposure:** in `deploy/compose.prod.yml` only the proxy publishes ports; Postgres, Redis, Ollama and ClamAV are on an `internal: true` network without egress.
- **Logging:** pino JSON logs with field-path redaction plus free-text scrubbing of VINs, phones, e-mails and bearer tokens. Audit events store a /24 or /48 IP prefix rather than full IPs.

## 3. Deployment-dependent controls (operator checklist)

- [ ] Secrets in a secret manager or root-owned files (`/etc/autocare/secrets`, mode 0400), never in images, compose files or repos
- [ ] `APP_ENV=production`, `TRUSTED_PROXY_HOPS=1`, `REDIS_URL` set (the app refuses to start otherwise)
- [ ] Full-disk/volume encryption on the VPS; backups encrypted with `age` (public key on host, private key offline)
- [ ] Postgres app role = `autocare_app` (DML only); migrations with `autocare_owner`
- [ ] ClamAV running (otherwise uploads stay quarantined by design)
- [ ] HSTS enabled after TLS verification; consider preload only after a stable period
- [ ] OS patching, SSH keys only, firewall allowing 22/80/443
- [ ] Monitoring alerts on 5xx rate, 429 spikes, `provider circuit opened`, AI queue saturation, disk usage, backup failures

## 4. Secret rotation and leak response

| Secret | Rotation | Effect |
|---|---|---|
| `DATA_ENCRYPTION_KEYS` | Add new `kid:key`, set `DATA_ENCRYPTION_ACTIVE_KEY_ID`, deploy, run `pnpm keys:reencrypt`, verify 0 remaining, remove old key | No downtime; old envelopes decrypt until re-encrypted |
| `CSRF_SECRET` | Replace and redeploy | Outstanding CSRF tokens invalid; clients refetch automatically |
| `FILE_URL_SECRET` | Replace and redeploy | Signed file URLs (≤5 min) invalid |
| Session tokens | `update sessions set revoked_at = now()` (all or per user) | Users sign in again |
| DB passwords | Create new password in the secret manager, `ALTER ROLE`, redeploy | Brief reconnect |
| Provider keys / webhook secrets | Rotate at the vendor, update secret, redeploy | — |

**Suspected leak:** (1) revoke/rotate the affected secret immediately; (2) revoke all sessions if session or CSRF material is involved; (3) review audit events and access logs for the exposure window; (4) assess personal-data impact and notification duties with legal counsel (`docs/COMPLIANCE.md`); (5) record a post-incident review.

## 5. Risk register

| # | Risk | L | I | Mitigation | Status | Owner |
|---|---|---|---|---|---|---|
| R1 | Data leak (DB dump, backup, logs) | M | H | Field encryption, encrypted backups, redaction, least-privilege DB role, no PII in audit meta | Mitigated (deploy controls pending) | Tech lead |
| R2 | Broken isolation between owners/merchants/workshops | M | H | Ownership in queries, anonymised merchant views, membership checks, BOLA tests | Mitigated, tested | Tech lead |
| R3 | Wrong repair information causes harm | M | H | Editorial drafts labelled unreviewed; safety areas never get generated steps; rules decide urgency; coverage limits shown; **technician review required before launch** | Open — needs qualified review | Product + technical reviewer |
| R4 | AI misleading users (hallucinated causes) | M | H | Grounded RAG, citations validated, uncovered codes gated, insufficient-evidence path, eval harness; measured results in `docs/AI_EVALUATION.md` | Partially mitigated; expert-reviewed eval set missing | AI owner |
| R5 | Learning poisoning / manipulated cases | M | M | Review workflow, duplicate & coordinated-submission flags, no automatic weight updates, only verified + consented cases | Mitigated; reviewer capacity needed | Technical reviewer |
| R6 | Data-rights violation (provider terms) | M | H | Licence policies default deny; contract-only vendors not called; no scraping; CarsXE terms unverified | Open until contracts signed | Business owner |
| R7 | Merchant fraud (fake genuine parts, fake reviews) | M | M | Seller claim vs moderator verification, reviews require delivered orders, flagging, merchant approval/suspension | Mitigated; moderation process needed | Operations |
| R8 | Service outage / AI capacity | M | M | Rules-only fallback, queue limits, health/ready endpoints, backups + restore drill | Mitigated; single-VPS SPOF remains | Ops |
| R9 | Account takeover | M | H | Argon2id, rate limits, MFA (mandatory for privileged), session management | Mitigated; no breached-password API yet | Tech lead |
| R10 | Account-lockout abuse via per-account login limit | M | L | 15-min soft block, IP limit, generic messages | Accepted (documented) | Tech lead |
| R11 | TOTP code replay inside its 30 s window | L | M | Rate limit on MFA attempts | Accepted; add last-used-step tracking | Tech lead |
| R12 | Supply-chain compromise | L | H | Lockfile, audit, Semgrep, Trivy, SBOM, pinned images | Mitigated in CI (CI not yet run on a remote) | Tech lead |
| R13 | Legal non-compliance (privacy, consumer, e-commerce) | M | H | Drafts + compliance matrix; local legal review required | Open | Business owner |
| R14 | Payment fraud: forged gateway callbacks, replayed or under-paid notifications, open redirects on return | M | H | Browser return never marks paid (server-side status query); Qi RSA-SHA256 webhook signature with operator PEM; ZainCash HS256 (alg pinned, expiry); amount must equal stored amount; idempotent `webhook_events`; reference binding; fulfil only after paid; fixed internal redirect targets; production refuses sandbox hosts/test gateway (`docs/PAYMENTS.md`) | Mitigated in code, tested; **sandbox run pending** | Tech lead + finance |
| R15 | Paid placement misleading users | M | M | Sponsored/featured items in separate labelled blocks, never re-order organic results or diagnoses; label only while the plan is paid; allowance caps (`docs/MONETIZATION.md`) | Mitigated; legal review of ad labelling pending | Product + legal |
| R16 | Admin abuse of billing (activating plans without payment, price changes) | L | M | `admin:billing` permission (sysadmin + MFA), re-auth for price changes and manual confirmations, audit events with before/after | Mitigated | Business owner |

## 6. ASVS v4.0.3 coverage (selected, self-assessed)

Self-assessment against the most relevant Level 2 requirements; not an audit.

| Chapter | Status |
|---|---|
| V2 Authentication | 2.1.1/2.1.2 length rules ✔, 2.1.7 breached-password check ✘ (planned), 2.2.1 anti-automation ✔, 2.4.1 Argon2id ✔, 2.5 recovery tokens hashed/expiring/single-use ✔, 2.7/2.8 TOTP ✔ (no backup codes yet ✘) |
| V3 Session Management | 3.2 new token on auth ✔, 3.3 logout/timeout/password-change invalidation ✔, 3.4 cookie flags ✔, 3.5 bearer for native clients ✔, 3.7 re-auth for sensitive ops ✔ |
| V4 Access Control | 4.1 server-side enforcement ✔, 4.2 IDOR protection ✔ (tested), 4.3 admin MFA ✔ |
| V5 Validation & Encoding | 5.1 schema validation ✔, 5.2 sanitisation where needed ✔, 5.3 output encoding ✔, 5.3.4 parameterised queries ✔ |
| V6 Cryptography | 6.2 approved algorithms (AES-GCM, SHA-256, HMAC-SHA256, Argon2id) ✔, 6.4 key management/rotation ✔ (documented), HSM ✘ |
| V7 Errors & Logging | 7.1 no sensitive data in logs ✔, 7.2 security events logged ✔, 7.3 log integrity — app role append-only; not tamper-proof against DB superusers ⚠ |
| V8 Data Protection | 8.3 sensitive data encrypted at rest (app-level) ✔, export/deletion ✔ |
| V9 Communications | TLS via Caddy ✔ (deployment), HSTS configurable ✔ |
| V10 Malicious Code / V14 Config | dependency scanning ✔ (CI), SBOM ✔, CSP ✔, headers ✔ |
| V12 Files | 12.1–12.6 type/size/magic, storage outside web root, AV, signed URLs ✔ |
| V13 API | 13.1 schema-validated JSON API ✔, 13.2 CSRF/CORS ✔ |

## 7. Accepted exceptions

| Finding | Severity | Why accepted | Owner | Review by |
|---|---|---|---|---|
| GHSA-67mh-4wv8-2f99 — esbuild ≤ 0.24.2 dev server CORS, reached via `drizzle-kit › @esbuild-kit/*` | moderate | Dev-only CLI dependency; esbuild's `serve` is never started; not in the production image | Tech lead | 2026-12-31 or the next drizzle-kit release, whichever first |

## 8. What has NOT been done

- No independent penetration test or code audit.
- CI workflow exists but has not run on a remote repository yet (no remote configured).
- No WAF / bot management beyond rate limits.
- No breached-password check, no MFA backup codes, no WebAuthn yet.
- Audit log is append-only for the application role only; it is not cryptographically chained.
