import { identifierKey, stripInvisible, toAsciiDigits } from "./text";

/**
 * Diagnostic trouble code parsing.
 *
 * Codes are NOT all of the form Pxxxx. We recognise several families and keep
 * the raw text the user typed so the original manufacturer/module format is
 * never lost. Parsing only classifies the *format*; whether a code is covered
 * for a given vehicle is decided by the knowledge base (DTCApplicability).
 */

export type DtcFormat =
  /** SAE J2012 / ISO 15031-6 five-character code, e.g. P0301, U0100. */
  | "sae_j2012"
  /** J2012 code + ISO 14229 failure-type byte, e.g. P0420-00, U0100:87, B1A2B 1C. */
  | "sae_j2012_ftb"
  /** Hex fault code used by some manufacturer tools (e.g. 4–6 hex digits like 2A82, 120308). */
  | "manufacturer_hex"
  /** Five-digit decimal codes used by some legacy European dealer tools (e.g. 16804). */
  | "legacy_numeric";

export type DtcSystem = "powertrain" | "chassis" | "body" | "network" | "unknown";
export type DtcScope = "generic" | "manufacturer" | "reserved" | "unknown";

export interface ParsedDtc {
  raw: string;
  /** Canonical key used for lookups (upper case, no separators, base code only). */
  code: string;
  /** Failure type byte when present (ISO 14229), upper-case hex. */
  failureType?: string;
  format: DtcFormat;
  system: DtcSystem;
  /**
   * Generic vs manufacturer-controlled per SAE J2012 ranges. For non-J2012
   * formats this is always "manufacturer" because the meaning depends on the
   * make/module and must never be answered from the generic table.
   */
  scope: DtcScope;
}

const SYSTEM_BY_LETTER: Record<string, DtcSystem> = {
  P: "powertrain",
  C: "chassis",
  B: "body",
  U: "network",
};

function j2012Scope(code: string): DtcScope {
  const letter = code[0];
  const d1 = code[1];
  const d2 = code[2];
  if (letter === "P") {
    if (d1 === "0" || d1 === "2") return "generic";
    if (d1 === "1") return "manufacturer";
    if (d1 === "3") {
      // P30xx–P33xx manufacturer controlled, P34xx–P39xx SAE reserved/generic.
      return d2 !== undefined && "0123".includes(d2) ? "manufacturer" : "generic";
    }
  } else {
    if (d1 === "0") return "generic";
    if (d1 === "1" || d1 === "2") return "manufacturer";
    if (d1 === "3") return "reserved";
  }
  return "unknown";
}

const J2012 = /^([PCBU][0-3][0-9A-F]{3})$/;
const J2012_FTB = /^([PCBU][0-3][0-9A-F]{3})[-: ]?([0-9A-F]{2})$/;
const HEX = /^[0-9A-F]{4,6}$/;
const LEGACY_NUM = /^[0-9]{5}$/;

/** Parse one code. Returns null when the token is not a recognisable DTC. */
export function parseDtc(input: string): ParsedDtc | null {
  const raw = input.trim();
  if (raw.length === 0 || raw.length > 16) return null;
  // Keep a single separator between base code and failure-type byte if present.
  const upper = identifierKey(raw.replace(/[:]/g, "-"));
  const spaced = raw.toUpperCase().replace(/\s+/g, " ").trim();

  let m = J2012.exec(upper);
  if (m && m[1]) {
    const code = m[1];
    return { raw, code, format: "sae_j2012", system: SYSTEM_BY_LETTER[code[0]!] ?? "unknown", scope: j2012Scope(code) };
  }
  m = J2012_FTB.exec(upper) ?? J2012_FTB.exec(spaced.replace(/[-:]/g, " "));
  if (m && m[1] && m[2]) {
    const code = m[1];
    return {
      raw,
      code,
      failureType: m[2],
      format: "sae_j2012_ftb",
      system: SYSTEM_BY_LETTER[code[0]!] ?? "unknown",
      scope: j2012Scope(code),
    };
  }
  if (LEGACY_NUM.test(upper)) {
    return { raw, code: upper, format: "legacy_numeric", system: "unknown", scope: "manufacturer" };
  }
  // Pure 4-digit numbers are too ambiguous (years, prices); require a hex letter or 6 digits.
  if (HEX.test(upper) && /\d/.test(upper) && (/[A-F]/.test(upper) || upper.length === 6)) {
    return { raw, code: upper, format: "manufacturer_hex", system: "unknown", scope: "manufacturer" };
  }
  return null;
}

/** Extract every recognisable DTC from free text such as "P0301, P0171 / U0100-87". */
export function extractDtcs(text: string, max = 20): ParsedDtc[] {
  // Invisible bidi/zero-width marks (common when pasting from RTL apps) must not hide a code.
  const tokens = toAsciiDigits(stripInvisible(text.normalize("NFKC")))
    .toUpperCase()
    .split(/[\s,،;؛\/|]+/)
    .filter(Boolean);
  const out: ParsedDtc[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < tokens.length && out.length < max; i++) {
    const t = tokens[i]!;
    // Allow "P0420 00" written with a space before the failure-type byte.
    const next = tokens[i + 1];
    let parsed: ParsedDtc | null = null;
    if (next && /^[0-9A-F]{2}$/.test(next) && J2012.test(t)) {
      parsed = parseDtc(`${t}-${next}`);
      if (parsed) i++;
    }
    parsed ??= /^[PCBU]/.test(t) ? parseDtc(t) : null;
    if (parsed) {
      const key = `${parsed.code}:${parsed.failureType ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(parsed);
      }
    }
  }
  return out;
}

/** Does the query look like a code rather than words? Used to route search. */
export function looksLikeDtcQuery(q: string): boolean {
  return parseDtc(q) !== null;
}
