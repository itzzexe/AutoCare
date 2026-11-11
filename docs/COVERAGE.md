# Coverage

Coverage is tracked per **make × model × year range × engine × market × system × provider** in `coverage_records`, and shown publicly at `/coverage` and to admins at `/admin/providers`.

## Status vocabulary

| Status | Meaning | Can the UI say "covered"? |
|---|---|---|
| `unknown` | Not checked | No |
| `pending_check` | A sample check is planned | No |
| `claimed_by_provider` | The provider's public documentation claims coverage; we have not tested it | No — shown as a claim |
| `verified_sample` | A real sample request returned usable data; evidence recorded (date, values, warnings) | Only for that exact make/model/year |
| `not_covered` | Sample check returned no data, or no source exists | No |

## Current state (2026-10-02)

Sample brands seeded: Toyota, Nissan, Honda, Ford, Chevrolet, BMW, Mercedes-Benz, Volkswagen, Hyundai, Kia, BYD, Geely, Chery, Changan, MG, Haval.

| System | Provider | State for all sample brands |
|---|---|---|
| VIN decode | NHTSA vPIC | `claimed_by_provider` for brands sold in the US (Toyota, Nissan, Honda, Ford, Chevrolet, BMW, Mercedes-Benz, Volkswagen, Hyundai, Kia) — based on the vPIC FAQ, **not** sample-checked for Iraqi/GCC VINs. `unknown` for BYD, Geely, Chery, Changan, MG, Haval |
| Generic DTC | Editorial KB | `pending_check` — 2,530 draft generic definitions with fixes (P0 1,416 · P2 733 · P34 98 · U0 269 · B0 10 · C0 4) + 49 symptom/warning-light guides; whether each brand's Iraqi-market models are OBD-II/EOBD compliant varies by market and year |
| Recalls | NHTSA Recalls | US-market campaigns only; shown with that caveat. Not checked against Iraqi/GCC VINs |
| Manufacturer DTC | `oem_licensed` (import) | `not_covered` until licensed data is imported (`pnpm kb:import`, `docs/DATA_IMPORT.md`). Uncovered requests are counted anonymously per make (Admin → Providers) |
| Repair procedures | Autodata / TecRMI | `unknown` — not contracted |
| Parts fitment | TecAlliance | `unknown` — not contracted |

**No coverage percentages are published**, because none have been measured.

## How to run a sample check

1. Collect real VINs from vehicles you are allowed to use (company cars, consenting staff, partner workshops) — one per make/model/year of interest, ideally Iraqi- and GCC-spec.
2. Add them to `ops/coverage-samples.csv` (`make,model,year,market,vin`).
3. `pnpm --filter @autocare/web coverage:sample` — each result is stored as `verified_sample` or `not_covered` with the decoded values and vendor warnings as evidence. Nothing is extrapolated to other years or models.
4. Review results in `/admin/providers`. Remove the VINs from the CSV afterwards (do not commit them).

For DTC coverage, a technical reviewer checks a sample of codes per brand against the vehicle's actual behaviour or dealer documentation, then records `verified_sample` with a short evidence note through `/api/v1/admin/coverage`.

## What the user sees

- Generic codes: definition + "applies to OBD-II compliant vehicles; details vary" + draft stamp.
- Manufacturer/module codes without a matching definition: an explicit "not covered — we won't show a generic meaning instead", even if a generic definition with the same characters exists.
- Manufacturer codes when no vehicle is selected: "pick your vehicle" only if a make-specific definition actually exists; otherwise "not covered".

## Generic sub-ranges deliberately left out (2026-10-02)

These codes were omitted because their exact generic title could not be stated with confidence. They should be filled from a licensed copy of SAE J2012-DA, not guessed.

- **P0003–P02FF:**
  - P003B–P003F, P006E–P006F, P00A5–P00B0, P00B8–P00BB, P00BE–P00FF
  - P011E–P011F, P012F
  - most P016x–P019x hex codes
  - P022A–P023F
  - most P024x–P029x hex codes
- **P0300–P05FF:**
  - P0364, P0395–P039F
  - most of P04A0–P04FF
  - P051F, P052F, P053D–P053F, P054E–P055F, P056A–P057A, P057F
  - P05A0–P05FF
- **P0600–P09FF:**
  - P065D–P065F, P06B0–P06B5, P06C5–P06D9, P06DF–P06FF
  - P071A–P071F, P073A–P07FF hex codes (friction elements)
  - P080B–P080F, P083A–P083F, P08A0–P08FF
  - P099A–P09FF
- **P2000–P24FF:**
  - P200A–P200B, P20A0–P20B8, P20BD–P20E7, P20F0–P20FF
  - P21A8–P21FF, P22A0–P22FF
  - P2348–P2399
  - P2448–P2449, P2464–P24FF
- **P2500–P2FFF:**
  - P2582–P2599, P2673–P2674, P2678–P2699
  - P2796–P2799, P2825–P2FFF (including P2Bxx/P2Cxx NOx/reductant codes)
- **Hybrid/EV:** parts of P0A7B–P0AFF, and all of P0B00–P0FFF.
- **U0:**
  - U0078–U0099, U0134–U0139, U0147–U0150
  - U0237 and above in the lost-communication block, U0332–U0399
  - U0432 and above (except U0452), U05xx–U06xx
- **B0:** pretensioners and later stages, occupant classification, impact sensors.
- **C0:** all except C0035, C0040, C0045 and C0050 (numbering is inconsistent between manufacturers).
