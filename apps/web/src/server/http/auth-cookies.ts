import "server-only";
import { CSRF_COOKIE, csrfCookieOptions, issueCsrfToken } from "../modules/identity/csrf";
import { SESSION_COOKIE, sessionCookieOptions } from "../modules/identity/sessions";

type SetCookie = (name: string, value: string, options: Record<string, unknown>) => void;

/** Set the session cookie and a fresh CSRF token bound to the NEW session id. */
export function issueSessionCookies(setCookie: SetCookie, s: { token: string; sessionId: string; absoluteExpiresAt: Date }): string {
  setCookie(SESSION_COOKIE(), s.token, sessionCookieOptions(s.absoluteExpiresAt));
  const csrf = issueCsrfToken(s.sessionId);
  setCookie(CSRF_COOKIE(), csrf, csrfCookieOptions());
  return csrf;
}

export function clearSessionCookies(setCookie: SetCookie): string {
  setCookie(SESSION_COOKIE(), "", { ...sessionCookieOptions(new Date(0)), maxAge: 0 });
  const csrf = issueCsrfToken("anon");
  setCookie(CSRF_COOKIE(), csrf, csrfCookieOptions());
  return csrf;
}
