# Requirements traceability

Status legend: **Done** = implemented and covered by automated tests · **Done (manual)** = implemented and verified by hand/browser run · **Partial** = implemented with stated gaps · **Test-mode** = works only in a test/fixture mode · **Waiting** = blocked on keys, contract, hardware or review · **Planned** = documented, not built.

Paths are relative to `apps/web/src` unless they start with `packages/`, `docs/`, `ops/`, `deploy/` or `.github/`.

## 1. Scope & working method

| Requirement | Implementation | Tests / evidence | Status |
|---|---|---|---|
| Inspect repo, plan, decision log | `docs/DECISIONS.md` | — | Done |
| Arabic RTL default + English LTR; codes/VIN/part numbers isolated LTR | `app/layout.tsx`, `i18n/*`, `components/ui/bits.tsx` (`Ltr`, `CodeTag`), `globals.css` | `e2e/smoke.mjs` (dir/lang, LTR engine code) | Done (manual) |
| Responsive mobile + desktop | Tailwind layouts, mobile tab bar | `e2e/smoke.mjs` at 390×844 and 1366×900 | Done (manual) |
| Iraq first: IQD, governorates, pickup/delivery, COD; extensible markets | `packages/contracts/src/geo.ts`, checkout | `market.test.ts` | Done |
| Mobile phase documented, PWA not presented as native | `docs/MOBILE_ROADMAP.md`, `app/manifest.ts` (no service worker) | — | Done |
| No public deploy / real payments / external messages | outbox + `EMAIL_PROVIDER=none`, test gateway | `market.test.ts` | Done |

## 2. Architecture

| Requirement | Implementation | Tests | Status |
|---|---|---|---|
| Next.js + TS, PostgreSQL + migrations + parameterised ORM | `server/db/*`, `drizzle/*.sql` | all integration tests | Done |
| Redis for rate limiting | `server/lib/rate-limit.ts` | `auth.test.ts` (memory store in tests) | Partial — Redis path not exercised in CI yet |
| Private S3-compatible or local file storage | `server/modules/files/service.ts` (local private dir) | `files-crypto.test.ts` | Partial — S3 adapter not implemented |
| Modular monolith with separated modules | `server/modules/*` | — | Done |
| Independent inference service | Ollama over `OLLAMA_URL` (private network) | `diagnostics-ai.test.ts` (fake runtime) | Done |
| OpenAPI, `/api/v1`, safe errors, pagination/limits/timeouts | `server/http/handler.ts`, `server/http/openapi.ts`, `/developers` | `http-security.test.ts` | Done (list endpoints use fixed limits; cursor pagination not yet) |
| Shared types for mobile | `packages/contracts` | `knowledge.test.ts` | Done |
| Stable versions, lockfile | `pnpm-lock.yaml`, DECISIONS D-002 | — | Done |
| No home-made crypto/auth | node:crypto AES-GCM, @node-rs/argon2, @oslojs/otp, Lucia pattern | — | Done |

## 3. Users & permissions

| Requirement | Implementation | Tests | Status |
|---|---|---|---|
| Guest, owner, merchant, workshop, technical reviewer, moderator, sysadmin | `modules/identity/rbac.ts` | `isolation.test.ts` | Done |
| Server-side RBAC + ownership on every resource | `route({permission})`, ownership in queries | `isolation.test.ts` (BOLA) | Done |
| Merchant/workshop/customer isolation; merchant never sees diagnostics | anonymised RFQ view, membership checks | `isolation.test.ts` | Done |
| Mechanic sees report only when shared | workshop-restricted share + `sharedReportForAppointment` | `isolation.test.ts` | Done |
| Audit of permission changes & sensitive admin access | `modules/audit`, `changeRole`, admin views | `auth.test.ts` | Done |

## 4. Vehicles & search

| Requirement | Implementation | Tests | Status |
|---|---|---|---|
| Multiple vehicles with full spec, optional VIN | `modules/vehicles`, `/garage` | `isolation.test.ts`, e2e | Done |
| VIN decode via provider + manual fallback + confirmation; VIN ≠ fitment proof | NHTSA adapter, `confirm-decode` re-decodes server-side | live check (DATA_SOURCES), `knowledge.test.ts` | Done |
| Search by code, symptoms, technical or local part name with Arabic-safe normalisation | `knowledge/dtc-service.ts`, `contracts/text.ts`, `part_terms` | `knowledge.test.ts` | Done |
| Generic, manufacturer and module-specific formats (not only Pxxxx) | `contracts/dtc.ts` | `knowledge.test.ts` | Done |
| Interpretation tied to make/model/year/engine/market/module/raw format, with source/date/version | `dtc_definitions`, `dtc_applicability`, `source_records` | `knowledge.test.ts` | Done |
| Code page: meaning, symptoms, causes, checks, sources, coverage limits, skill | `components/dtc-view.tsx`, `/codes/[code]` | screenshots | Done (manual) |
| Never present a generic meaning for an uncovered manufacturer code | `lookupDtc` | `knowledge.test.ts` | Done |

## 5. Providers & coverage

| Requirement | Implementation | Tests | Status |
|---|---|---|---|
| Unified provider interface + swappable adapters | `modules/providers/*` | `knowledge.test.ts` | Done |
| Autodata, TecRMI, TecAlliance (OneDB/ChinaID/TecDoc), CarsXE evaluated from current docs | `docs/DATA_SOURCES.md` | — | Done (evaluation); integrations **Waiting** for contracts/keys |
| "Not configured" state + test-only mocks | `adapters.ts`, `registry.ts` | `knowledge.test.ts` | Done |
| Coverage matrix incl. JP/US/DE/KR/CN brands, sample check without invented results | `coverage_records`, `/coverage`, `scripts/coverage-sample.ts` | — | Partial — matrix seeded with honest states; sample VINs not supplied yet |
| Separate code definitions / repair procedures / fitment | separate tables | — | Done |
| Provenance + licence per record; conflict, outage, licence expiry | `source_records`, `license_policies`, conflict detection, circuit breaker | `knowledge.test.ts` | Done |
| Timeouts, backoff, circuit breaker, honour limits | `providers/resilience.ts` | `knowledge.test.ts` | Done |
| Usage rights gate caching/translation/offline/embeddings/training | `usageAllowed()`, `rag_allowed` | `knowledge.test.ts`, `diagnostics-ai.test.ts` | Done |
| No scraping | — | — | Done |

## 6. Diagnostic sessions

| Requirement | Implementation | Tests | Status |
|---|---|---|---|
| Vehicle → codes/symptoms → onset/conditions/maintenance/related codes/check results; save & resume; share with permission | `modules/diagnostics/service.ts`, `/diagnose/*` | `diagnostics-ai.test.ts`, e2e | Done |
| Checks ordered easiest → specialist, tools, expected result, home vs workshop | `rules.ts` ordering, `CheckStep` | `diagnostics-ai.test.ts` | Done |
| Structured result (explanation, causes + evidence, missing info, next check, urgency, workshop advice, conditional parts) | `generateRecommendation`, `result-view.tsx` | `diagnostics-ai.test.ts` | Done |
| No part replacement on code alone | prompt rule + validator (conditional parts need `onlyIf`) + UI copy | `diagnostics-ai.test.ts` | Done |
| Safety rules (brakes, steering, airbags, fuel, high voltage) with referral; no generated risky steps | `rules.ts`, `skipped_safety` | `diagnostics-ai.test.ts` | Done — **rules need technician review** |
| Insufficient info shown honestly; no invented confidence | `insufficient_info`, `skipped_no_coverage`, % stripped | `diagnostics-ai.test.ts` | Done |
| Versions of rules/model/prompt/sources recorded; urgency isolated from model text | `diagnostic_recommendations` | `diagnostics-ai.test.ts` | Done |

## 7. Local AI

| Requirement | Implementation | Tests / evidence | Status |
|---|---|---|---|
| Commercially licensable local model via Ollama; no cloud/silent fallback; cloud features off | `ai/ollama.ts` (`assertLocalOnly`), `OLLAMA_NO_CLOUD=1` in compose | `diagnostics-ai.test.ts` | Done |
| Compare several models (Arabic + English refs); choose by quality/hardware | `scripts/ai-eval.ts`, `docs/AI_EVALUATION.md` | eval runs | Partial — llama3.1 and qwen3 measured on a synthetic set; expert set missing |
| CPU and GPU configs, queue/tokens/timeouts/cancellation | `ai/gate.ts`, env limits, AbortSignal | `diagnostics-ai.test.ts` | Done |
| Explicit model download | docs + admin view; never automatic | — | Done |
| RAG from permitted sources & verified cases, hybrid retrieval, vehicle/system filters, verifiable source ids | `ai/rag.ts` | `diagnostics-ai.test.ts`, `learning.test.ts` | Done |
| JSON schema output validated server-side, rendered safely | `ai/prompt.ts` | `diagnostics-ai.test.ts` | Done |
| Prompt-injection & cross-user leakage protection; limited tools | fencing, per-user context, no tools | `diagnostics-ai.test.ts`, eval case s16 | Done |
| Model failure keeps documented search available, shows reason | rules-only path + `modelStatus` | `diagnostics-ai.test.ts` | Done |

## 8. Cases & improvement

| Requirement | Implementation | Tests | Status |
|---|---|---|---|
| Structured cases incl. measurements, confirmed cause, repair, parts, date, cost+currency, outcome, follow-up, attachments, unresolved cases | `repair_cases`, `repair_outcomes`, `/cases/new` | `learning.test.ts` | Done |
| Private record separated from improvement copy; opt-in withdrawable versioned consent | `consent_records`, `learning_case_copies` | `learning.test.ts` | Done |
| De-identification (no names/contacts/plates/VIN/photos); not hashing-as-anonymisation | `learning/anonymize.ts` | `learning.test.ts` | Done (pattern scrubbing + reviewer confirmation) |
| States submitted/needs_review/verified/rejected/inconclusive; unreviewed never in KB; duplicates/manipulation/conflicts flagged | `submitCase`, `reviewCase` | `learning.test.ts` | Done |
| Three-layer improvement: RAG update, re-ranking, optional LoRA | RAG update Done; re-ranking **Planned** (needs data volume); LoRA **Planned** | — | Partial |
| Dataset export with versions/provenance/consents; leakage-safe split; registry, approval, rollback | `buildDataset`, `exportDataset`, `model_versions`, `setModelStatus` | `learning.test.ts` | Done (training pipeline itself not run) |
| Withdrawal policy for trained weights documented | `docs/PRIVACY_AND_CONSENT.md` | — | Done |

## 9. Marketplace

| Requirement | Implementation | Tests | Status |
|---|---|---|---|
| Merchant accounts & approval, catalogue, OE/OEM numbers, brand, condition, images, warranty/returns, price/stock/delivery | `modules/market`, `/merchant` | `isolation.test.ts`, `market.test.ts` | Done (image upload via generic upload pipeline; product image UI minimal) |
| Seller claim "genuine" vs moderator-verified | `authenticity_claim` vs `authenticity_verified_*` | `market.test.ts` | Done |
| Fitment by model/year/engine/market + source; "compatible per source" vs "needs confirmation" | `part_fitments`, `fitmentLabel` | `market.test.ts` | Done |
| Multi-merchant RFQ, offer comparison, cart, checkout, private delivery address | `offer_requests`, `offers`, `/market/requests`, `/cart` | `market.test.ts` | Done |
| COD first + test-mode e-payment adapter | `payments`, test webhook | `market.test.ts` | Test-mode |
| Sub-orders per merchant with status/shipping/returns; transactional stock; idempotent orders & webhooks; server-verified payment; no card data | `checkout`, `merchant_orders`, `webhook_events` | `market.test.ts` | Done |
| Reviews from real purchases; abuse moderation; ads separated & labelled; AI never orders | `reviews`, flags, `sponsored` | `market.test.ts` | Done |

## 10. Workshops, maintenance, reports

| Requirement | Implementation | Tests | Status |
|---|---|---|---|
| Directory by region/specialty/brand; booking, confirmation, status changes; reviews tied to completed service | `modules/workshops`, `/workshops` | `isolation.test.ts` | Done |
| Arabic PDF reports with correct direction | `modules/reports/pdf.ts` | e2e + visual check | Done (manual) |
| Random, expiring, revocable, permission-bound share links | `report_shares` | `isolation.test.ts` | Done |
| Maintenance log & reminders by date and odometer; user vs source-schedule reminders; in-app notifications; e-mail/SMS separate and "not configured" | `modules/maintenance` | `maintenance.test.ts` | Done — source-schedule reminders need a licensed schedule provider |
| Workshop mode: limited customer data, work orders, checks, quotes, results | `/workshop`, `work_orders` | `isolation.test.ts` | Done |

## 11. Security — named items

| Item | Status | Where |
|---|---|---|
| Input Validation | Done | SECURITY.md §2 |
| Rate Limiting | Done | SECURITY.md §2 |
| Sanitize user input | Done | SECURITY.md §2 |
| Do not expose API keys | Done | SECURITY.md §2 |
| Flag Risks | Done | SECURITY.md §5 |
| Rotate secrets | Done | SECURITY.md §4, `scripts/reencrypt.ts` |
| .env variables | Done | `.env.example`, `scripts/env-init.ts` |
| SQL Injection | Done | SECURITY.md §2 |
| Applicable Compliance | Done (draft matrix) | `docs/COMPLIANCE.md` |
| CSRF protection | Done | `identity/csrf.ts` |
| Sessions Expiration | Done | `identity/sessions.ts` |
| Hash Passwords | Done | `identity/password.ts` |
| XSS | Done | CSP, no raw HTML |
| file upload security | Done | `files/service.ts` |
| Scan Dependencies | Done in CI config (not yet run remotely) | `.github/workflows/ci.yml` |
| Security Headers | Done | `next.config.ts`, `proxy.ts` |
| CORS Config | Done | `proxy.ts` |
| Enforce HTTPS everywhere (production) | Done (config + redirect; HSTS opt-in) | `proxy.ts`, `deploy/Caddyfile` |
| MFA for privileged roles, re-auth for sensitive actions | Done | `handler.ts`, `identity/service.ts` |
| Field encryption AES-256-GCM with key ids | Done | `lib/crypto.ts` |
| SSRF protection | Done (no user-URL fetching; fixed hosts; private runtime only) | SECURITY.md §2 |
| Redacted structured logs, audit trail | Done | `lib/logger.ts`, `modules/audit` |
| Threat model, ASVS mapping | Done (self-assessed) | SECURITY.md §1, §6 |

## 9b. Knowledge base expansion, integrations and revenue (turn 3)

| Requirement | Implementation | Tests / evidence | Status |
|---|---|---|---|
| Broad generic code library with "how to fix" | `server/db/seed-data/{dtc-families,dtc-extended,handwritten-fixes}.ts`, `dtc_definitions.fixes`, `components/dtc-view.tsx` | `knowledge.test.ts`; seed count check (549 unique, all with fixes) | Done (content = drafts) |
| "All codes": full generic catalogue | `seed-data/catalog/*`, `dtc-templates.ts`, `scripts/validate-catalog.ts` | validator (0 problems), seed count 2,530 unique, all with fixes | Partial — omitted uncertain sub-ranges listed in `docs/COVERAGE.md` |
| Manufacturer codes via licensed data only | `knowledge/importer.ts`, `scripts/kb-import.ts`, provider `oem_licensed`, `docs/DATA_IMPORT.md` | `kb-import.test.ts` | Done (no licensed data imported yet) |
| Demand signal for uncovered manufacturer codes | `dtc_demand`, `recordDemand`, Admin → Providers | `kb-import.test.ts` | Done |
| Symptom and warning-light guides | `seed-data/fault-guides.ts`, `fault_guides` table, `/guides`, `/guides/[slug]`, search hits | `knowledge.test.ts` (colloquial symptom → guide → codes) | Done (drafts) |
| Code library browsing | `/codes` (groups, paging), related guides on code pages | manual (dev server) | Done (manual) |
| Grounded RAG keeps only code documents | `ai/rag.ts` (`restrictToCodes` ⇒ `dtc_reference`) | `diagnostics-ai.test.ts` | Done |
| SEO for public knowledge pages, opt-in | `server/http/seo.ts`, `app/sitemap.ts`, `app/robots.ts`, per-page metadata | manual | Done (off by default) |
| NHTSA recalls on the vehicle page | `providers/adapters.ts` (`nhtsaRecalls`), `vehicles/external.ts`, `garage/[id]/recalls-panel.tsx`, `GET /vehicles/{id}/recalls` | `integrations.test.ts` | Done |
| vPIC model autocomplete | `nhtsaVpic.modelsForMakeYear`, `GET /catalog/models`, `garage/vehicle-form.tsx` | `integrations.test.ts` | Done |
| Iraqi payment gateways | `payments/gateways.ts` (Qi Card, ZainCash v1), `payments/service.ts`, return + webhook routes, cart/orders UI | `billing.test.ts` (signatures, amount match, idempotency, reference binding, fulfil-after-paid, prod guards) | Partial — not exercised against a merchant sandbox; ZainCash v1 availability unconfirmed |
| Subscriptions with server-side entitlements | `billing/service.ts`, `plans`/`subscriptions`, `/pricing`, `/account/billing`, `/admin/billing` | `billing.test.ts` | Done (prices unset by design) |
| Commission ledger | `commission_entries`, accrual on delivered, void on return, merchant statement | `billing.test.ts` | Done (settlement is an operator process) |
| Labelled paid placement | `sponsoredForCatalog`, `setProductSponsored`, featured workshops block | `billing.test.ts` | Done |
| Safety info never paywalled | Plan checks only gate vehicle count and the optional model explanation | `billing.test.ts`, `diagnostics-ai.test.ts` | Done |

## 12–17. Compliance, mobile, data model, operations, tests, delivery

| Requirement | Implementation | Status |
|---|---|---|
| Privacy policy, terms, learning consent, merchant & returns policies as drafts; export, deletion, consent withdrawal; retention | `/legal/*`, `modules/account`, `scripts/retention.ts`, `docs/PRIVACY_AND_CONSENT.md` | Done (drafts pending legal review) |
| PCI DSS evaluation | `docs/COMPLIANCE.md` | Done (no card data) |
| Mobile contracts & permissions; OBD; offline; on-device models | `auth/mobile/login`, `docs/MOBILE_ROADMAP.md` | Planned (API ready) |
| ERD & migrations for all listed entities | `server/db/schema/*`, `drizzle/`, `docs/ARCHITECTURE.md` | Done (`VehicleVariant` table present; populated only by future providers) |
| Docker/Compose dev; Linux/VPS production path; reverse proxy & TLS; non-root; health/readiness; resource limits; backups/restore; monitoring | `docker-compose.yml`, `deploy/*`, `apps/web/Dockerfile`, `ops/backup/*`, `docs/DEPLOYMENT.md` | Partial — prepared; production run not executed |
| Secure admin bootstrap; no default admin | `scripts/bootstrap-admin.ts` | Done |
| Demo data separated & refused in production; mocks refused in production | `scripts/seed-demo.ts`, `config/env.ts` guards | Done |
| CI for build, tests, scans; controlled migrations; non-destructive rollback | `.github/workflows/ci.yml`, DEPLOYMENT §7 | Partial — CI defined, not run remotely |
| Test categories from §16 | `tests/*`, `e2e/*`, `docs/TEST_REPORT.md` | Done / Partial as listed in the report |
| AI evaluation on expert-reviewed answers | `scripts/ai-eval.ts` | **Waiting** — needs expert-reviewed cases |
