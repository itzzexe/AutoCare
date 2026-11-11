import { identifierKey } from "./text";

/**
 * VIN helpers. A VIN is identification data, NOT proof of part fitment.
 * The ISO 3779 check digit (position 9) is mandatory only in North America
 * and China; elsewhere a mismatch is reported as a warning, never a hard error.
 */

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeVin(input: string): string {
  return identifierKey(input);
}

export function isWellFormedVin(vin: string): boolean {
  return VIN_RE.test(vin);
}

export function vinCheckDigitValid(vin: string): boolean {
  if (!isWellFormedVin(vin)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i]!;
    const v = /\d/.test(ch) ? Number(ch) : TRANSLIT[ch] ?? 0;
    sum += v * WEIGHTS[i]!;
  }
  const r = sum % 11;
  const expected = r === 10 ? "X" : String(r);
  return vin[8] === expected;
}

/** Display form for logs/UI where the full VIN must not appear: WMI + last 4. */
export function maskVin(vin: string): string {
  if (vin.length < 8) return "•".repeat(vin.length);
  return `${vin.slice(0, 3)}${"•".repeat(vin.length - 7)}${vin.slice(-4)}`;
}
