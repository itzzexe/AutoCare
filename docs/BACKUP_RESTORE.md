# Backup and restore

## What is backed up

| Item | Method | Encryption |
|---|---|---|
| PostgreSQL (all application data, audit log, migrations table) | `pg_dump -Fc` streamed into `age` | `age` public-key encryption; private key offline |
| Uploads volume (`/data/uploads`, clean + quarantine) | `tar` streamed into `age` | same |
| Secrets & keys | **Not** in these backups — kept in the secret manager with its own backup/escrow | — |
| Ollama models | Not backed up (re-downloadable; record exact tags in the model registry) | — |

Script: `ops/backup/backup.sh` (daily). Checksums are written next to each backup. Retention: 35 daily copies, then deleted — this bounds how long erased data can survive in backups.

## Key availability

Restoring requires **both** the `age` private key (for the backup files) **and** the `DATA_ENCRYPTION_KEYS` that were active when the data was written (for VINs, addresses, phone numbers, TOTP secrets). Keep at least every key id referenced by live data; never remove an old encryption key before `pnpm keys:reencrypt` reports nothing left. Store both in the secret manager plus an offline escrow (e.g. two people, sealed).

## Restore drill (monthly)

`ops/backup/restore-test.sh` verifies checksums, decrypts the latest dump into a throwaway `pgvector/pgvector:pg17` container, restores it and runs sanity counts (users, vehicles, orders, applied migrations). Record date, duration and result in the operations log.

## Full restore (disaster)

1. Provision host as in `DEPLOYMENT.md`, restore secrets from the secret manager.
2. Start `postgres`, create roles (`ops/sql/roles.sql`).
3. `age -d -i key db-<stamp>.dump.age | pg_restore -U autocare_owner -d autocare --no-owner`
4. Re-apply grants: `psql -f ops/sql/post-migrate-grants.sql`.
5. `age -d -i key uploads-<stamp>.tar.age | tar -C /data -xf -`
6. Start `web`; check `/api/v1/ready`; log in with a test account; open a vehicle with a VIN (proves the field-encryption key is correct).
7. Invalidate sessions if the incident involved credential exposure.

## Verified locally (2026-10-02)

On the development machine (Docker Desktop, `pgvector/pgvector:pg17`):

- `pg_dump -Fc` of the seeded database: 0.6 s, ~200 KB.
- Restore into a fresh throwaway container with `--exit-on-error`: **exit 0** after pre-creating the `autocare_app` and `autocare_owner` roles (the dump's grants and default privileges reference them — the drill script now does this). A first attempt without the roles restored the data but reported 59 ignored ACL errors, which is why the script now creates them and uses `--exit-on-error`.
- Sanity checks after restore: users 6, vehicles 2, DTC definitions 25, migrations 3; `autocare_app` still has **no** UPDATE privilege on `audit_events`.

Not yet exercised: the `age` encryption/decryption step (age not installed on the dev machine), the uploads tarball, systemd timers, and any run on a production host.

## RPO / RTO targets (proposed)

- RPO 24 h with daily dumps (lower it with WAL archiving if required).
- RTO ~2 h for a single-VPS restore, excluding DNS changes and model downloads.
