# Deployment

The application is **not deployed publicly**. This document prepares a single-VPS production deployment for review. Nothing here has been run on a production host yet.

## 1. Sizing (measured on the development machine only)

| Component | Notes |
|---|---|
| web | ~300–500 MB RSS under light load; Chromium spawned only while rendering a PDF |
| PostgreSQL 17 + pgvector | 1–2 GB RAM for the current schema; storage grows with uploads/sessions |
| Redis | < 64 MB |
| ClamAV | ~1.5–2 GB RAM (signatures) |
| Ollama + qwen3:8b Q4_K_M | ~5.2 GB weights; with an 8k context it needs ~6.5–7 GB — **an 8 GB GPU is borderline** (llama3.1:8b at 8k context ran 93% GPU / 7% CPU at ~15 tok/s on an RTX 5060 Ti 8 GB). On CPU only, expect tens of seconds per answer; measure before choosing a VPS |
| bge-m3 | ~1.2 GB; embedding the current corpus (32 chunks) took ~40 s including model load |

A small CPU-only VPS can run everything **except** responsive LLM answers. Options: (a) GPU VPS / dedicated GPU host on the private network (`OLLAMA_URL`), (b) CPU with `AI_MODE=disabled` (rules + knowledge base only), (c) CPU with long timeouts and low concurrency. No suitability claim is made without measuring on the target hardware (`pnpm ai:eval`).

## 2. Host preparation (Linux)

1. Ubuntu 24.04 LTS (or similar), unattended security updates, SSH key auth only, firewall: 22 (restricted), 80, 443.
2. Docker Engine + Compose plugin; for GPU: NVIDIA driver + NVIDIA Container Toolkit.
3. Encrypted volume for `/var/lib/docker` and `/var/backups/autocare` (LUKS or provider-encrypted disks).
4. Create `/etc/autocare/app.env` (root:root, 0400) and `/etc/autocare/secrets/{pg_owner_password,redis_password}` from the secret manager. Required variables:

```
APP_ENV=production
APP_ORIGIN=https://autocare.example.org
TRUSTED_PROXY_HOPS=1
DATABASE_URL=postgres://autocare_app:<app-password>@postgres:5432/autocare
DATABASE_MIGRATION_URL=postgres://autocare_owner:<owner-password>@postgres:5432/autocare
REDIS_URL=redis://:<redis-password>@redis:6379
CSRF_SECRET=<32+ random bytes, base64>
FILE_URL_SECRET=<32+ random bytes, base64>
DATA_ENCRYPTION_KEYS=k2026a:<32 random bytes, base64>
DATA_ENCRYPTION_ACTIVE_KEY_ID=k2026a
AI_MODE=local_only
AI_MODEL=qwen3:8b
AI_EMBED_MODEL=bge-m3
PROVIDER_NHTSA_ENABLED=true
HSTS_ENABLED=false            # true once TLS is verified
```

Generate random values with `openssl rand -base64 32`. `ENABLE_MOCK_PROVIDERS` and `ALLOW_DEMO_SEED` must stay unset/false — the app refuses to start otherwise.

## 3. First start

```bash
# images: runtime (standalone server) and a tools image with the full workspace for one-off commands
docker build -f apps/web/Dockerfile -t autocare-web:$(git rev-parse --short HEAD) .
docker build -f apps/web/Dockerfile --target build -t autocare-tools:$(git rev-parse --short HEAD) .
export WEB_IMAGE=autocare-web:<tag>

docker compose -f deploy/compose.prod.yml up -d postgres redis clamav ollama

# least-privilege application role (password from the secret manager), then default grants
docker compose -f deploy/compose.prod.yml exec -T postgres   psql -U autocare_owner -d autocare -c "CREATE ROLE autocare_app LOGIN PASSWORD '<app-password>';"
docker compose -f deploy/compose.prod.yml exec -T postgres psql -U autocare_owner -d autocare < ops/sql/roles.sql

# migrations (owner role; also re-applies ops/sql/post-migrate-grants.sql), base seed, first admin
docker run --rm --network autocare_internal --env-file /etc/autocare/app.env autocare-tools:<tag>   sh -c "cd apps/web && pnpm db:migrate && pnpm db:seed && pnpm admin:bootstrap --email admin@your.org"

docker compose -f deploy/compose.prod.yml up -d web proxy
curl -fsS https://autocare.example.org/api/v1/ready
```

`admin:bootstrap` prints a one-time random password; the admin must change it and enrol MFA before any admin page unlocks. There is no default admin account.

## 4. Models (explicit step, never automatic)

The `ollama` container has no internet egress (internal network). Pull models in a maintenance window:

```bash
docker network connect bridge autocare-ollama-1     # temporary egress
docker compose -f deploy/compose.prod.yml exec ollama ollama pull qwen3:8b    # ~5.2 GB
docker compose -f deploy/compose.prod.yml exec ollama ollama pull bge-m3      # ~1.2 GB
docker network disconnect bridge autocare-ollama-1
```

`OLLAMA_NO_CLOUD=1` is set; the app also refuses non-private runtime URLs and `*-cloud` models. Then embed the corpus: admin → Overview → "Index embeddings" (or `pnpm ai:index`), and record an evaluation (`pnpm ai:eval -- --model qwen3:8b`).

## 5. TLS and HSTS

Caddy obtains certificates automatically for the domain in `deploy/Caddyfile` and redirects HTTP to HTTPS. After confirming HTTPS works for all subdomains in use, set `HSTS_ENABLED=true` and restart `web`.

## 6. Monitoring & alerts

- Health: `GET /api/v1/health` (liveness), `GET /api/v1/ready` (DB reachable; reports Redis/AI state).
- Logs: JSON on stdout (Docker json-file, rotated). Ship to your log stack; alert on `unhandled api error`, `provider circuit opened`, `rate limiter store failure`, `upload held in quarantine`.
- AI usage: `ai_usage` table (latency, tokens, status per request) and admin overview (queue depth, installed models).
- Disk: Postgres volume, uploads volume, backup directory.
- Backups: alert when `backup.sh` exits non-zero or no new file appears for 26 h.

## 7. Releases and rollback

1. CI green (tests, audit, gitleaks, Semgrep, Trivy) on the commit.
2. Take a backup (`ops/backup/backup.sh`).
3. Apply migrations (forward-only, additive by policy: add columns/tables first, backfill, switch code, remove old columns in a later release).
4. Deploy the new image tag.
5. Rollback = redeploy the previous image tag. Because migrations are additive, the previous code keeps working against the newer schema; destructive migrations require an explicit restore plan and are not allowed in the same release as the code change.

## 8. Scheduled jobs (host cron / systemd timers)

| Job | Schedule | Command |
|---|---|---|
| Backup | daily 02:30 | `ops/backup/backup.sh` |
| Restore drill | monthly | `ops/backup/restore-test.sh` |
| Retention | daily 03:30 | `pnpm ops:retention` (tools container) |
| Re-scan quarantined uploads | hourly | `rescanQuarantined()` (wire to a tools-container script when ClamAV was down) |

## 9. Costs

Only verified prices are listed: CarsXE publishes plan prices on its pricing page (sandbox free with 100 lifetime calls; paid monthly tiers). Autodata, TecRMI and TecAlliance pricing is not public. VPS/GPU costs depend on the provider and region and must be quoted at purchase time.
