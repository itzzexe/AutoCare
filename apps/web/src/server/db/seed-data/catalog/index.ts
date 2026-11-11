import type { SeedDtcWithFixes } from "../dtc-families";
import { TEMPLATES } from "../dtc-templates";
import { GENERIC_CODE_RE, type CatalogRow } from "./types";
import { ROWS as P00 } from "./p0000-p0299";
import { ROWS as P03 } from "./p0300-p0599";
import { ROWS as P06 } from "./p0600-p0999";
import { ROWS as P20 } from "./p2000-p2499";
import { ROWS as P25 } from "./p2500-p2fff-p34-hybrid";
import { ROWS as UBC } from "./u0-b0-c0";

export const CATALOG_ROWS: CatalogRow[] = [...P00, ...P03, ...P06, ...P20, ...P25, ...UBC];

/** Builds draft definitions for catalogue rows not already covered by richer hand-written/family entries. */
export function buildCatalogLibrary(exclude: Set<string>): SeedDtcWithFixes[] {
  const seen = new Set(exclude);
  const out: SeedDtcWithFixes[] = [];
  for (const [code, en, ar, key, safety] of CATALOG_ROWS) {
    if (seen.has(code) || !GENERIC_CODE_RE.test(code)) continue;
    const t = TEMPLATES[key];
    if (!t) continue;
    seen.add(code);
    out.push({
      code, titleEn: en, titleAr: ar, system: t.system, meaningAr: t.meaningAr, meaningEn: t.meaningEn,
      symptoms: t.symptoms, causes: t.causes, checks: t.checks, fixes: t.fixes, baseUrgency: t.urgency, skillLevel: t.skill,
      safetyArea: safety ?? t.safety,
    });
  }
  return out;
}
