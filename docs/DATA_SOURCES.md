# Data sources

All findings below were checked against the vendors' **public** pages on **2026-10-02**. "Not verified" means we could not see it publicly; it must be confirmed with the vendor before use. No endpoint or schema was invented: where documentation is not public, the adapter only reports its configuration state.

## Status overview

| Provider | Capability | Integration state in code | Usage rights recorded | Blocking item |
|---|---|---|---|---|
| AutoCare editorial KB (`internal_curated`) | Generic DTC definitions (drafts), local part terms | **Active** | Own content | Technician review of every entry |
| NHTSA vPIC (`nhtsa_vpic`) | VIN decode; model list for make/year (autocomplete) | **Implemented** (live calls verified 2026-10-02) — off in tests | Display + store on the owner's vehicle only | No explicit licence text found; GCC/Iraqi VIN coverage unverified |
| NHTSA Recalls (`nhtsa_recalls`) | US recall campaigns by make/model/year | **Implemented** (live calls verified 2026-10-02; HTTP 400 = no data) | Display verbatim in English with a US-market caveat; 6 h in-memory cache | US campaigns only — GCC/Iraqi-spec cars may not be covered |
| CarsXE OBD decoder (`carsxe`) | Generic OBD-II code text | **Implemented per public docs**, inactive without key **and** recorded licence | None (terms page was placeholder text) | Written terms (caching, display, translation) |
| Autodata API (`autodata`) | Repair data, schedules, times | **Contract-only stub** (`not_configured`) | None | Contract + developer docs access |
| TecAlliance TecRMI (`tecrmi`) | Repair & maintenance data | **Contract-only stub** | None | Contract + docs |
| TecAlliance China — OneDB / ChinaID / TecDoc (`tecalliance_cn`) | VIN→KType, vehicle data, fitment | **Contract-only stub** | None | Customer key; confirm auth placement (header vs body token differ between doc pages) |
| Test fixtures (`mock_test`) | VIN/DTC fixtures | Tests only; refused in production | n/a | — |

A provider is used **only** when: (1) it is configured, (2) not disabled by an admin, and (3) a current licence policy exists. Each permission in the policy (`display`, `cache` + TTL, `translation`, `offline`, `embeddings`, `training`, `redistribution`) defaults to **false** (`license_policies`, `providers/registry.ts`). An expired policy turns the provider into `license_expired` immediately.

## Provider notes

### NHTSA vPIC
- `GET https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{VIN}?format=json&modelyear=YYYY` — no key; values are strings, `""` means "no data" (not "feature absent"). `ErrorCode` can be non-zero on a partially useful decode (e.g. `6 - Incomplete VIN`).
- Server capacity statement ("1000–2000 transactions/minute") is not a per-client quota; an automated traffic-control mechanism applies. We limit VIN decodes to 20/hour/user.
- Coverage per FAQ: ~99% decode confidence for 1995+ vehicles of major manufacturers sold in the US; 60–65% for 1980–1994. **Iraqi and GCC-spec vehicles are not covered by that statement**; Chinese brands not sold in the US are not expected to decode.
- The VIN leaves our system only when the owner presses "Decode VIN" (disclosed in the UI). The decode is a suggestion the owner must confirm and is never treated as fitment proof.

### CarsXE
- `GET https://api.carsxe.com/obdcodesdecoder?key=KEY&code=P0115` → `{ success, diagnosis, code, date }`; 400/401/404/429 documented. Key travels in the query string, so calls are server-side only and URLs are never logged.
- Public pricing exists (sandbox 100 calls lifetime; paid tiers per month). Overage rates and terms were not verified; the terms page showed placeholder text.
- Only generic SAE codes are ever sent. Results are shown labelled as "external provider description" and compared against the editorial text; disagreement raises a visible conflict notice.

### Autodata / TecRMI
- Public pages describe REST/JSON (Autodata: OAuth 2.0 via TIBCO Mashery) but full docs are behind login. Coverage figures on the Autodata page conflict with each other (34,000 models/142 makes vs 40,000 vehicles/155 makes) — do not quote either.
- Implementation plan after contract: map their DTC/repair/schedule objects into `dtc_definitions` (with `dtc_applicability`), `knowledge_documents` (only if `allowEmbeddings`), and `maintenance_reminders` with `origin = source_schedule`.

### TecAlliance China
- Public examples: `POST https://api.tecalliance.cn/data/api/getVehicleByNumberType` (VIN→KType) and `https://onedb.tecalliance.cn/api/vehicles` (TecDoc vehicle search). The adapter is not implemented until a key and confirmed auth scheme exist.
- Fitment from TecDoc would populate `part_fitments` with `source = provider`, which is the only path (besides moderator verification) to the "compatible per source" label.

## Separation of data kinds

- **Code definitions** — `dtc_definitions` + `dtc_applicability` (make/model/year/engine/market/module/raw format).
- **Repair procedures & general documents** — `knowledge_documents` / `knowledge_chunks` (`rag_allowed` derived from licence).
- **Parts fitment** — `part_fitments` (source: provider / merchant claim / moderator verified).
- Every row links to a `source_records` row (provider, licence policy, version, fetched date, expiry, status).

## Caching, translation, offline, RAG and training

| Use | Rule |
|---|---|
| Cache | Only if `allowCache`; `source_records.expires_at` from TTL; expired rows are not served (tested) |
| Translation | Only if `allowTranslation` — otherwise provider text is shown in its original language |
| Offline / mobile download | Only if `allowOffline` (none granted) |
| Embeddings / RAG | Only if `allowEmbeddings` → `knowledge_documents.rag_allowed` |
| Model training | Only if `allowTraining`; dataset builder uses only verified, consented case copies (not provider content) |
| Revocation / contract end | Admin sets provider disabled or records an end date ⇒ immediately unusable; `source_records.status = disabled` removes content from lookups and retrieval |

No scraping is used to get around any restriction.

## Editorial knowledge base

Version `kb-library-0.2` / `guides-0.1` (2026-10-02). Everything below is project-authored, written from general automotive knowledge and the public SAE J2012 code titles. Every item is labelled **draft (unreviewed)** in the UI until a qualified technician reviews it (`review_status = reviewed`). Manufacturer-specific codes are deliberately absent, because their meanings differ by brand and need a licensed source.

| File | Content | Count |
|---|---|---|
| `seed-data/generic-dtc.ts` + `handwritten-fixes.ts` | Hand-written definitions (v0.1) with fixes | 25 codes |
| `seed-data/dtc-families.ts` | Generated families: sensor circuits (range/low/high/intermittent), per-cylinder misfire, coils, injectors, O2 sensors and heaters, cam timing, transmission ratios and solenoids, common one-off codes, network U-codes, wheel-speed C-codes | 390 codes |
| `seed-data/dtc-extended.ts` | Generic titles grouped by subsystem template (fuel trim, electronic throttle, EVAP, secondary air, cruise, charging, immobiliser, reference voltage, glow plugs, transmission pressure/shift, more U-codes) | 134 codes |
| `seed-data/catalog/*.ts` + `dtc-templates.ts` | Generic catalogue: P0000–P09FF, P2000–P2FFF, P34xx cylinder deactivation, P0Axx hybrid/EV, U0 network, B0 restraints. One row = standard generic title (EN) + Arabic title + subsystem template | 2,520 rows (1,981 not already covered above) |
| `seed-data/fault-guides.ts` | Symptom guides (noises, smells, smoke, leaks, vibration, starting, brakes, steering, cooling, A/C, tyres, electrical) and 15 dashboard warning lights | 49 guides |

In total there are **2,530 generic codes** (P0: majority, P2, U0, C0, B0). Each code has a meaning, symptoms, causes, checks ordered from least to most invasive, and **fixes that apply only after the cause is confirmed**. Safety areas (brakes, steering, airbag, fuel, high voltage) suppress DIY steps.

**What is deliberately not included:**
- **Gaps in the generic ranges.** Codes whose exact generic title we could not state with confidence were left out rather than guessed; the omitted sub-ranges are listed in `docs/COVERAGE.md`. Some newer hex codes and late J2012 additions are missing for the same reason.
- **C0 chassis codes.** Only the 4 entries already in the library are included, because manufacturers use C0 numbers inconsistently (for example, GM's wheel-speed numbering differs from other makes).
- **Manufacturer-specific codes.** These come only from licensed imports; see `docs/DATA_IMPORT.md`.

Generated entries share a subsystem template, so their causes and checks are generic for that family; they are not tailored to a specific vehicle. That is acceptable for drafts, and technician review should prioritise the most frequent codes first.
