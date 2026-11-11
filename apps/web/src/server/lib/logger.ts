import "server-only";
import pino from "pino";

/**
 * Structured JSON logs with redaction. Field-path redaction covers known
 * keys; `scrub()` additionally masks VINs, phone numbers, bearer tokens and
 * e-mail addresses that appear inside free-text values.
 */

const REDACT_PATHS = [
  "password", "*.password", "newPassword", "currentPassword",
  "token", "*.token", "totp", "*.totp",
  "authorization", "*.authorization", "cookie", "*.cookie", "headers.cookie", "headers.authorization",
  "vin", "*.vin", "phone", "*.phone", "address", "*.address",
  "apiKey", "*.apiKey", "secret", "*.secret",
];

const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
const PHONE_RE = /(?:\+?964|0)7\d{2}[\s-]?\d{3}[\s-]?\d{4}|\+?\d[\d\s-]{8,}\d/g;
const BEARER_RE = /(bearer\s+)[A-Za-z0-9\-_.~+/]+=*/gi;
const EMAIL_RE = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

export function scrub(text: string): string {
  return text
    .replace(BEARER_RE, "$1[redacted]")
    .replace(VIN_RE, (v) => `${v.slice(0, 3)}…${v.slice(-2)}`)
    .replace(PHONE_RE, "[phone]")
    .replace(EMAIL_RE, "$1…@$2");
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: { paths: REDACT_PATHS, censor: "[redacted]" },
  base: { svc: "autocare-web" },
  formatters: {
    log(obj) {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string") (obj as Record<string, unknown>)[k] = scrub(v);
      }
      return obj;
    },
  },
});
