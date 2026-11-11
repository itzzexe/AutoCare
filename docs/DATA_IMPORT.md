# Importing manufacturer-specific codes (licensed data)

## Why the app does not ship them

Manufacturer-specific codes (`P1xxx`, `P30xx–P33xx`, `B1/B2`, `C1/C2`, `U1/U2`, plus hex module codes such as BMW `2A82`) are defined by each manufacturer, and often by model, year, engine and module. The same code means different things on a Toyota and a Kia, and sometimes on two Toyota engines. The authoritative meanings live in OEM service information or in licensed aggregators (Autodata, TecRMI, Mitchell 1, ALLDATA, Identifix and similar). Writing them "from memory" would produce plausible but wrong answers, and a wrong code meaning is exactly what makes people replace the wrong part.

The app therefore answers a manufacturer code **only** from data the operator is licensed to use. It also records which uncovered codes users actually ask for, so the operator knows which data to buy first.

## Where to get the data legally (checked 2026-10-02)

| Source | What it offers | How it plugs into this app | How to start |
|---|---|---|---|
| **MOTOR Information Systems** — [DTC data product](https://www.motor.com/products-services/data-products/diagnostic-trouble-codes/) | Generic **and manufacturer-specific** DTCs with probable causes, related components and repair guidance, "based on OEM and SAE standards"; delivered "via API or bulk format" | Bulk export → `pnpm kb:import`, or a live adapter written from their API docs | Licence through MOTOR sales (+1 800-426-6867). The product targets the North American fleet, so ask about GCC/Iraq-market coverage |
| **Autodata** — [DTC data](https://www.autodata-group.com/) | DTCs advertised as covering "99% of vehicles", in a standard format, with OEM known fixes | Bulk export → `pnpm kb:import`, or a live adapter under contract (the provider stub already exists) | Contact Autodata. The developer docs sit behind a contract |
| **CarMD API** — [developer site](https://dev-website.carmd.com/api) | Per-VIN repair data that covers "SAE public standard codes and OEM non-standard codes": repair, parts, cost, urgency. US vehicles since 1996 | Live adapter per lookup (VIN + code). **Not built yet:** the developer site was unreachable from our environment, so the endpoints and response schema could not be verified | Free developer registration gives keys. Read the terms on caching/storing/display before use |
| Aggregator marketplaces (e.g. [ZylaLabs DTC decoder](https://zylalabs.com/api-marketplace/data/dtc+codes+decoder+api/2322)) | Claim manufacturer-specific coverage | Possible adapter | Verify the data's origin and licence first: resold or scraped data is not acceptable |

Scraping code lists from public websites is **not** a legitimate source. Those lists are usually copied from manufacturer data without a licence, and their accuracy is unknown.

## Steps

1. **Obtain the data.**
   - Typical sources: an OEM service-information subscription (export rights vary), or an aggregator contract.
   - Get **written** terms covering display, caching duration, translation, offline use, and use in AI retrieval (RAG).
2. **Record the licence.**
   - In **Admin → Providers**, record a licence policy for provider `oem_licensed` with exactly the rights the contract grants. Everything defaults to deny.
   - Without `allowDisplay` the importer refuses to run.
   - Without `allowEmbeddings` the imported codes are shown on code pages but are never sent to the AI.
3. **Convert the export** to `docs/templates/manufacturer-dtc-import.csv` (UTF-8, header row), or to a JSON array with the same keys.

   | Column | Required | Notes |
   |---|---|---|
   | `code` | yes | As printed by the tool, e.g. `P1349`, `B1A00`, `2A82` |
   | `make` | yes | e.g. `Toyota` |
   | `model`, `yearFrom`, `yearTo`, `engine`, `market`, `module` | recommended | Applicability. A row without `model` applies to the whole make. |
   | `titleEn`, `meaningEn` | yes | Source text |
   | `titleAr`, `meaningAr` | optional | Only if the contract allows translation. There is no machine translation. |
   | `symptoms`, `causes`, `fixes` | optional | Several items separated by `\|` |
   | `skillLevel` | optional | `diy` \| `intermediate` \| `workshop` \| `specialist` |
   | `safetyArea` | optional | `brakes` \| `steering` \| `airbag` \| `fuel` \| `high_voltage` \| `none` |
   | `baseUrgency` | optional | `urgent` \| `soon` \| `monitor` |

4. **Dry run, then import:**
   ```
   pnpm kb:import --file toyota.csv --title "Toyota service data export" --version 2026-10 --licence "Contract #123" --dry-run
   pnpm kb:import --file toyota.csv --title "Toyota service data export" --version 2026-10 --licence "Contract #123"
   ```
   - Run it from the project root or from `apps/web`. A relative `--file` path is resolved from the folder you run it in.
   - With the embedded development database (no `DATABASE_URL`), stop `next dev` first: only one process can open it at a time.
   - Invalid rows are reported with their line number.
   - Duplicates of the same code, make, module and version are skipped.
   - Everything is imported as **draft** and linked to a source record that carries the licence reference and its expiry.
5. **Review.** A technical reviewer can mark entries as reviewed. Once the licence expires, the content stops being served automatically.

## What users see

- **Vehicle matches the imported applicability:** the code page shows the licensed definition, with its source and version.
- **Same make, other model or year:** "the make is partly covered, but not for this car". No guess is shown.
- **No vehicle selected:** the user is asked to pick their car.
- **No data for that make:** a clear "not covered", a note that the demand was counted anonymously, and a link to the symptom guides.

## Demand list

**Admin → Providers** lists the uncovered manufacturer codes that users asked for, by make and count. No user data is stored. Use the list to prioritise which manufacturers to license first.
