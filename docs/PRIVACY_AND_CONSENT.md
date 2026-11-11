# Privacy and consent

Engineering description of how personal data is handled. The user-facing texts are drafts at `/legal/privacy`, `/legal/terms`, `/legal/learning-consent` and `/legal/merchant-policy` and **must be reviewed by a lawyer** before launch (see `docs/COMPLIANCE.md`).

## Data inventory

| Data | Where | Protection | Who can read |
|---|---|---|---|
| E-mail, display name | `users` | — | Owner; sysadmin (admin user search is audited) |
| Password | `users.password_hash` | Argon2id hash | Nobody |
| TOTP secret | `users.mfa_secret_enc` | AES-256-GCM, AAD `mfa:<user>` | Server only |
| VIN | `vehicles.vin_enc` | AES-256-GCM, AAD `vehicle:<id>:vin`; masked copy for display | Owner (full value only after re-auth) |
| Vehicle specs | `vehicles` | — | Owner; snapshot (no VIN) shared with merchants/workshops when the owner asks for quotes/appointments |
| Diagnostic sessions & results | `diagnostic_*` | — | Owner; workshop only through an explicit share; anyone with an unexpired, unrevoked share token (report only) |
| Repair cases | `repair_cases` | — | Owner; technical reviewers see content without submitter identity |
| Delivery address & phone | `orders.address_enc` | AES-256-GCM | Buyer; each merchant for its own confirmed/shipped sub-order |
| Merchant/workshop phone | `*.phone_enc` | AES-256-GCM | Server; not exposed in public views |
| Uploads | private storage | random keys, quarantine, scanning, re-encoding | Owner via signed URLs |
| IP | `sessions.ip_prefix`, `audit_events.ip_prefix` | truncated to /24 or /48 | Owner (own devices), sysadmin (audit) |

## Learning consent

- **Separate from the Terms** (registration does not grant it), **opt-in** (off by default), **versioned** (`learning-consent-2026.10-v1`), **scoped** (`sources: ["repair_cases"]`) and **withdrawable** at any time (`/cases`, `/account/privacy`, `PUT /api/v1/consent`).
- Stored in `consent_records` with text version, sources, grant and withdrawal timestamps.

### The improvement copy

Only when (a) a technical reviewer marks a case **verified** and (b) the user has active consent covering `repair_cases`, a separate `learning_case_copies` row is created:

- vehicle reduced to make/model/year/engine/fuel/transmission/market (no VIN, plate, owner)
- free text scrubbed for phone numbers, e-mails, VIN patterns, Iraqi plate patterns, long digit runs and "my name is …" phrases
- repair date reduced to month; cost bucketed to 5,000 IQD; attachments and photos excluded
- the reviewer must tick "no names/phones/plates/addresses remain" before verifying

This is data minimisation plus scrubbing, **not** guaranteed anonymisation, and hashing is not used as an anonymisation technique. Copies are readable only by reviewer/admin roles. `source_case_id` is kept (restricted) solely so withdrawal can find and delete the copy; it is never exported.

### Withdrawal

`withdrawConsent()` in one transaction: closes the consent, deletes all the user's copies, disables the derived knowledge documents and their source records (no longer retrievable — tested). Exported datasets skip copies that no longer exist.

**Models already trained:** removing a row does not remove its influence from model weights. Policy: (1) copies are excluded from every future dataset immediately; (2) a model version trained on a dataset that contained withdrawn copies is flagged at the next review and retrained/retired according to a schedule agreed with legal counsel; (3) the consent text states this plainly. No automatic weight updates exist — fine-tuning is a separate, admin-approved pipeline.

## Rights flows

| Right | How |
|---|---|
| Access / portability | `GET /api/v1/account/export` (re-auth) → JSON with account, vehicles (with decrypted VIN), sessions, cases, consents, maintenance, RFQs, orders (with decrypted addresses), appointments |
| Rectification | Edit vehicle, profile fields; cases can receive follow-up outcomes |
| Erasure | `DELETE /api/v1/account` (re-auth): consent withdrawn, e-mail/name/phone/MFA removed, VINs wiped, sessions & cases deleted, addresses removed from orders, share links revoked. Merchant sub-orders remain (needed by the merchant) without the buyer's address |
| Withdraw consent | See above |

## Retention (draft — confirm with legal)

| Data | Period | Mechanism |
|---|---|---|
| Revoked/expired sessions | 30 days after end | `pnpm ops:retention` |
| One-time tokens | 7 days after expiry | retention job |
| Outbox (unsent mail) | 30 days | retention job |
| Expired share links | 30 days after expiry | retention job |
| Notifications | 180 days | retention job |
| Delivery addresses | 120 days after order | retention job nulls `address_enc` |
| AI usage metering | ~13 months | retention job |
| Audit events | 12 months | retention job (owner role) |
| Backups | 35 days rolling, encrypted | `ops/backup/backup.sh` — deleted data disappears from backups when they age out |
| Training datasets | Until retired; withdrawn copies skipped at export | dataset `status` |

## What is not done yet

- No cookie banner is needed for current behaviour (only strictly necessary cookies: session, CSRF, theme, locale) — confirm with counsel.
- No DPIA has been written; recommended before launch.
- No automated breach-notification workflow; see SECURITY.md §4.
