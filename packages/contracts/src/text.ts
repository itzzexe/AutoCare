/**
 * Text normalisation helpers.
 *
 * These produce *search keys* only. Stored/displayed text is never rewritten
 * with them, so Arabic spelling chosen by the user is preserved verbatim.
 * Validation, normalisation, sanitisation and output encoding are separate
 * steps (see docs/SECURITY.md §Input handling).
 */

const ARABIC_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩]/g;
const ZERO_WIDTH = /[​-‍﻿]/g;

/** Convert Arabic-Indic (٠-٩) and Persian (۰-۹) digits to ASCII digits. */
export function toAsciiDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** Strip invisible direction/zero-width controls that can be used to spoof codes. */
export function stripInvisible(input: string): string {
  return input.replace(BIDI_CONTROLS, "").replace(ZERO_WIDTH, "");
}

/**
 * Search key for Arabic + Latin free text: NFKC, lowercase Latin, no tashkeel,
 * unified alef/yaa/taa-marbuta forms, collapsed whitespace.
 */
export function searchKey(input: string): string {
  return toAsciiDigits(stripInvisible(input.normalize("NFKC")))
    .replace(ARABIC_DIACRITICS, "")
    .replace(TATWEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalise an identifier-like token (VIN, OE number): ASCII digits, upper case, no separators. */
export function identifierKey(input: string): string {
  return toAsciiDigits(stripInvisible(input.normalize("NFKC")))
    .toUpperCase()
    .replace(/[\s\-_.\/]/g, "");
}

/** Trim and collapse whitespace while keeping the original script and spelling. */
export function cleanDisplayText(input: string): string {
  return stripInvisible(input.normalize("NFC")).replace(/[\t ]+/g, " ").trim();
}
