# Decision log

Routine choices were made with reversible defaults; each entry states why and how to change it.

| ID | Decision | Reason | Revisit when |
|---|---|---|---|
| D-001 | **pnpm monorepo**: `apps/web` + `packages/contracts` | Shared zod contracts and normalisers for the future React Native app without sharing UI code | Mobile project starts (add `apps/mobile`) |
| D-002 | **Next.js 16.3.8 (App Router), React 19.2, TypeScript 5.9** — versions current and stable on 2026-10-02, lockfile committed | Requested default; Next 16 renamed middleware to `proxy.ts` (Node runtime), used for CSP/CORS/HTTPS | Major upgrades via changelog + CI |
| D-003 | **Drizzle ORM 0.45 + drizzle-kit**, SQL migrations committed | Parameterised queries, typed schema, plain SQL migrations reviewable in PRs | — |
| D-004 | **Embedded PGlite (WASM Postgres + pgvector) for dev/tests; real PostgreSQL 17 + pgvector in production** (start-up guard refuses PGlite in prod) | Docker was not running at the start; real Postgres semantics without external services; tests are fast and isolated. CI also runs the suite on real Postgres | — |
| D-005 | **Sessions implemented with the Lucia v3 pattern** (random 256-bit token, SHA-256 id, server-side revocation) on audited primitives (`node:crypto`, `@oslojs/otp`, `@node-rs/argon2`) | Full control of idle/absolute timeouts, rotation and mobile bearer sessions; the Lucia author's recommended reference design instead of an ad-hoc scheme | If a managed IdP is adopted |
| D-006 | **CSRF = signed double-submit cookie bound to the session + Origin/Sec-Fetch-Site check**, JSON-only bodies | OWASP-recommended pattern for cookie-authenticated APIs; SameSite is defence in depth only | — |
| D-007 | **rate-limiter-flexible** with Redis; per-operation policies; sensitive ones fail closed | Mature library, shared store across instances, insurance limiter for non-sensitive ops | — |
| D-008 | **Local AI via Ollama**; generation **qwen3:8b** (Apache-2.0), embeddings **bge-m3** (MIT, 1024-d, multilingual); llama3.1:8b kept as comparison only | Commercially licensable; Arabic capability; fits an 8 GB GPU with Q4 quantisation. Measured comparison in `AI_EVALUATION.md` | After expert-reviewed eval set exists |
| D-009 | **Hybrid retrieval in Postgres** (FTS on a normalised column + pgvector, reciprocal-rank fusion) | Corpus is small; one database to secure and back up; no extra search engine justified | Corpus > ~1M chunks or latency issues |
| D-010 | **Rules decide urgency; model only explains** | Safety-critical behaviour must be deterministic, versioned and reviewable | Never fully removed |
| D-011 | **Money in integer minor units; IQD exponent 0** (ISO 4217 lists 3, but fils are not in circulation) | Avoids misleading fractions in prices; per-currency exponent table | If fils are reintroduced or another currency needs it |
| D-012 | **PDF via headless Chromium (playwright-core)** with JS disabled and offline | Only reliable way to get correct Arabic shaping + bidi; Edge channel on Windows dev, Debian Chromium in the container | — |
| D-013 | **Self-hosted OFL fonts** (Readex Pro, Reem Kufi, Martian Mono) | Distinctive bilingual typography; CSP `font-src 'self'`; no build-time dependency on Google Fonts (which timed out on the build network) | — |
| D-014 | **Uploads as raw request bodies** (not multipart) to `/api/v1/uploads?purpose=` | Smaller parsing surface; magic-byte detection on the full buffer | — |
| D-015 | **No service worker** | Avoids caching private reports; the manifest only allows installing a shortcut. Offline features are a separate mobile phase | Mobile/offline phase |
| D-016 | **E-mail provider not integrated**; messages go to an encrypted outbox (dev-only viewer for sysadmin) | No authorisation to send external messages yet | When a provider and sender domain are approved |
| D-017 | **Payments: cash on delivery + test-mode gateway adapter** with HMAC webhook | No live payment account; no card data ever touches the platform | When a PCI-compliant gateway is contracted |
| D-018 | **Uncovered codes never go to the model** (`skipped_no_coverage`) and retrieval is restricted to documents of covered codes | Measured: llama3.1 invented causes for uncovered manufacturer codes (insufficient-evidence rate 33%); after the gate 100% | — |
| D-019 | **IP addresses stored as /24 or /48 prefixes** in sessions and audit | Enough for abuse investigation; less personal data | — |
| D-020 | **Contracts package consumed as TypeScript source** (`transpilePackages`) | No build step; the mobile app can import the same source | If published to a registry |
| D-021 | **Halabja listed as a governorate** | Approved by the Iraqi parliament in 2025; list kept in one place (`geo.ts`) | Operations review |
