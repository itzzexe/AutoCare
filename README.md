# AutoCare IQ — أوتوكير IQ

منصة ويب عربية (RTL) مع واجهة إنجليزية (LTR) لتفسير أكواد أعطال السيارات بمصادر موثّقة، وتشخيص إرشادي خطوة بخطوة بقواعد سلامة ثابتة ونموذج ذكاء اصطناعي يعمل محليًا، وسوق قطع بطلب عروض أسعار، ودليل ورش ومواعيد — للسوق العراقي أولًا (IQD، المحافظات، الدفع عند الاستلام).

> **الحالة:** نسخة تطوير قابلة للتشغيل محليًا. **غير منشورة للعامة وليست جاهزة للإنتاج.** قاعدة المعرفة الحالية مسودات تحريرية لم يراجعها فني بعد، ومزوّدو البيانات التجاريون غير متعاقد معهم. التفاصيل في «ما يعمل وما ينتظر» أدناه.

An Arabic-first web platform for interpreting vehicle trouble codes from cited sources, guided diagnosis with deterministic safety rules and a **locally hosted** LLM, a parts marketplace with quote requests, and a workshop directory — Iraq first.

---

## Quick start (development)

Requirements: Node.js ≥ 22, pnpm 10. Optional: Docker (Postgres/Redis/ClamAV), Ollama (local AI).

```bash
pnpm install
cd apps/web
pnpm env:init          # writes .env.local with fresh random keys (git-ignored)
pnpm db:seed           # embedded PostgreSQL (PGlite) is created + migrated automatically
pnpm db:seed:demo      # optional: labelled demo merchants/workshop/products; prints random passwords once
pnpm dev               # http://localhost:3000
```

Local AI (optional, explicit downloads):

```bash
ollama pull qwen3:8b   # ~5.2 GB, Apache-2.0
ollama pull bge-m3     # ~1.2 GB, MIT (embeddings)
pnpm ai:index          # embed the knowledge base
pnpm ai:eval -- --model qwen3:8b
```

Without Ollama the app still works: results come from the knowledge base and safety rules, and the UI states why the assistant was not used.

Real PostgreSQL + Redis instead of the embedded database:

```bash
docker compose up -d postgres redis
# in apps/web/.env.local
DATABASE_URL=postgres://autocare_app:autocare_app_dev@localhost:5432/autocare
DATABASE_MIGRATION_URL=postgres://autocare_owner:autocare_owner_dev@localhost:5432/autocare
REDIS_URL=redis://:autocare_redis_dev@localhost:6379
pnpm db:migrate && pnpm db:seed
```

First administrator (no default admin exists): `pnpm admin:bootstrap --email you@example.org` → one-time random password; enrol MFA under Account → Security before admin pages unlock.

## Commands

| Command (in `apps/web`) | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm typecheck` | TypeScript |
| `pnpm test` | Vitest integration suite (embedded Postgres; `TEST_DATABASE_URL=…` for a real server) |
| `pnpm e2e` | Browser smoke test against a running server (`E2E_EMAIL`, `E2E_PASSWORD`) |
| `pnpm db:generate` / `db:migrate` / `db:seed` / `db:seed:demo` | Schema migrations and seeds |
| `pnpm admin:bootstrap --email …` | Create the first sysadmin |
| `pnpm ai:index` / `ai:eval` | Embeddings / model evaluation |
| `pnpm keys:reencrypt` | Re-encrypt fields after key rotation |
| `pnpm coverage:sample` | Record VIN-decode sample checks from `ops/coverage-samples.csv` |
| `pnpm ops:retention [--dry-run]` | Retention clean-up |
| `pnpm bench:argon2` | Measure password-hash cost on this machine |

## What works / what is waiting

| Area | State |
|---|---|
| Accounts, sessions, MFA, RBAC, CSRF, rate limits, encryption, uploads, headers | **Implemented & tested** |
| Code search (generic, manufacturer, module formats; Arabic/Iraqi terms) | **Implemented & tested**; content = **2,530 generic codes with fixes + 49 symptom/warning-light guides**, all **drafts** (technician review pending); browsable at `/codes` and `/guides` |
| Manufacturer codes | **Not shipped** (licensed data only); importer `pnpm kb:import` + anonymous demand list — `docs/DATA_IMPORT.md` |
| SEO | Canonical URLs, metadata, `sitemap.xml`, `robots.txt` — **off** until `INDEXING_ENABLED=true` |
| Recalls + model autocomplete (NHTSA) | **Implemented & tested** with recorded response shapes; US-market data labelled as such |
| VIN decode (NHTSA vPIC) | **Implemented**, verified with a public sample VIN; Iraqi/GCC coverage not sample-checked |
| Diagnosis wizard, rules, PDF report, share links | **Implemented & tested** (incl. browser e2e) |
| Local AI (Ollama, RAG, structured output, grounding gates) | **Implemented & tested**; evaluation on a **synthetic, unreviewed** set only (`docs/AI_EVALUATION.md`) |
| Cases, expert review, learning consent, datasets, model registry | **Implemented & tested**; fine-tuning pipeline not run (needs approved data + hardware) |
| Marketplace (RFQ, offers, cart, checkout, sub-orders, returns, reviews) | **Implemented & tested**; cash on delivery works; **Qi Card and ZainCash adapters implemented from docs and unit-tested, not yet run against a merchant sandbox** (`docs/PAYMENTS.md`) |
| Revenue: plans, entitlements, commission ledger, sponsored/featured placement, admin revenue dashboard | **Implemented & tested** (`docs/MONETIZATION.md`); prices are **not set** — the operator sets them in `/admin/billing` |
| Workshops, appointments, work orders, maintenance reminders | **Implemented** (core paths tested) |
| Autodata / TecRMI / TecAlliance / CarsXE | **Waiting for contracts/keys**; adapters report `not_configured` |
| E-mail/SMS | **Not configured** — in-app notifications only |
| Malware scanning | Works with ClamAV; without it uploads stay quarantined by design |
| Legal texts | **Drafts** pending legal review |
| Mobile apps, OBD, offline | **Not started** — plan in `docs/MOBILE_ROADMAP.md` |
| Production deployment | Prepared (`deploy/`), **not executed** |

## Documentation

- [Architecture & ERD](docs/ARCHITECTURE.md) · [Decisions](docs/DECISIONS.md)
- [Security, threat model, risk register](SECURITY.md)
- [Data sources](docs/DATA_SOURCES.md) · [Coverage](docs/COVERAGE.md)
- [Payments](docs/PAYMENTS.md) · [Monetization](docs/MONETIZATION.md) · [Manufacturer data import](docs/DATA_IMPORT.md)
- [Privacy & consent](docs/PRIVACY_AND_CONSENT.md) · [Compliance matrix](docs/COMPLIANCE.md)
- [AI evaluation](docs/AI_EVALUATION.md) · [Test report](docs/TEST_REPORT.md)
- [Deployment](docs/DEPLOYMENT.md) · [Backup & restore](docs/BACKUP_RESTORE.md)
- [Mobile / OBD / offline roadmap](docs/MOBILE_ROADMAP.md)
- [Requirements traceability](docs/REQUIREMENTS_TRACEABILITY.md)
- API: `/developers` (human-readable) and `/api/v1/openapi.json`

## Design

The interface uses a "workshop ledger" visual language — service tickets, inspection tags for codes, rubber stamps for review states, hazard tape for urgent results — with self-hosted Reem Kufi / Readex Pro / Martian Mono (OFL). Arabic is the default; codes, VINs and part numbers are isolated as LTR inside RTL text.
