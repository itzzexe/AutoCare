import { searchKey } from "@autocare/contracts";
import { scrub } from "../../lib/logger";

/**
 * De-identification for the improvement copy. This is data minimisation +
 * pattern scrubbing, NOT a guarantee of anonymity: free text can still contain
 * personal details, so a reviewer must confirm before a case is verified.
 * Hashing is not used as an anonymisation technique here.
 */

const IQ_PLATE = /\b\d{1,6}\s?[ء-ي]{1,3}\s?\d{0,6}\b|\b[ء-ي]\s?\d{3,6}\b/g;
const LONG_DIGITS = /\b\d{7,}\b/g;
const NAME_HINT = /(اسمي|انا اسمي|my name is|call me|اتصل ب|رقمي|my number)\s+\S+(\s+\S+)?/gi;

export function scrubFreeText(text: string): string {
  return scrub(text).replace(NAME_HINT, "[personal]").replace(IQ_PLATE, "[plate]").replace(LONG_DIGITS, "[number]").slice(0, 2000);
}

export interface CaseForLearning {
  vehicleSnapshot: Record<string, unknown>;
  codes: string[];
  symptoms: string;
  measurements: Array<{ name: string; value: string; unit?: string }>;
  confirmedCause: string | null;
  confirmedBy: string;
  repairPerformed: string | null;
  partsReplaced: Array<{ name: string; oeNumber?: string }>;
  repairDate: string | null;
  costMinor: number | null;
  currency: string | null;
  outcome: string;
}

export function toLearningPayload(c: CaseForLearning): Record<string, unknown> {
  const v = c.vehicleSnapshot;
  return {
    vehicle: { make: v.make, model: v.model, year: v.year, engine: v.engine, fuel: v.fuel, transmission: v.transmission, salesMarket: v.salesMarket },
    codes: c.codes.slice(0, 20),
    symptoms: scrubFreeText(c.symptoms),
    measurements: c.measurements.map((m) => ({ name: scrubFreeText(m.name), value: scrubFreeText(m.value), unit: m.unit })),
    confirmedCause: c.confirmedCause ? scrubFreeText(c.confirmedCause) : null,
    confirmedBy: c.confirmedBy,
    repairPerformed: c.repairPerformed ? scrubFreeText(c.repairPerformed) : null,
    parts: c.partsReplaced.map((p) => ({ name: scrubFreeText(p.name), oeNumber: p.oeNumber })),
    // Month precision only.
    repairMonth: c.repairDate ? c.repairDate.slice(0, 7) : null,
    // Bucketed cost reduces linkability.
    costBucket: c.costMinor != null && c.currency ? { currency: c.currency, approx: Math.round(c.costMinor / 5000) * 5000 } : null,
    outcome: c.outcome,
  };
}

/** Grouping key so a case and its near-duplicates/derivatives fall into the same split. */
export function groupKeyFor(c: Pick<CaseForLearning, "vehicleSnapshot" | "codes" | "confirmedCause">): string {
  const v = c.vehicleSnapshot;
  return [String(v.make ?? "").toLowerCase(), String(v.model ?? "").toLowerCase(), [...c.codes].sort().join("+"), searchKey(c.confirmedCause ?? "").split(" ").slice(0, 6).join("_")].join("|");
}
