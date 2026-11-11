import "server-only";
import { env, isProd } from "../../config/env";
import { hmacB64u, randomToken, safeEqual } from "../../lib/crypto";

/**
 * CSRF protection: signed double-submit cookie bound to the session
 * (OWASP CSRF Cheat Sheet, "Signed Double-Submit Cookie"), PLUS an
 * Origin / Sec-Fetch-Site check (see lib/request.ts). SameSite=Lax on the
 * session cookie is defence in depth only.
 *
 * token = <random>.<HMAC(CSRF_SECRET, binding + ":" + random)>
 * binding = session id (SHA-256 of the session token) or "anon" before login.
 * The client echoes the cookie value in the `x-csrf-token` header; a
 * cross-site attacker can neither read the cookie nor forge the signature.
 */
export const CSRF_COOKIE = () => (isProd() ? "__Host-acq_csrf" : "acq_csrf");
export const CSRF_HEADER = "x-csrf-token";

export function issueCsrfToken(binding: string): string {
  const r = randomToken(18);
  return `${r}.${hmacB64u(env().CSRF_SECRET, `${binding}:${r}`)}`;
}

export function verifyCsrfToken(binding: string, headerValue: string | null, cookieValue: string | undefined): boolean {
  if (!headerValue || !cookieValue || !safeEqual(headerValue, cookieValue)) return false;
  const [r, sig] = headerValue.split(".");
  if (!r || !sig) return false;
  return safeEqual(sig, hmacB64u(env().CSRF_SECRET, `${binding}:${r}`));
}

export function csrfCookieOptions() {
  // Readable by our own JS (not HttpOnly) by design; scoped to path "/" with __Host- prefix in prod.
  return { httpOnly: false, secure: isProd(), sameSite: "strict" as const, path: "/" };
}
