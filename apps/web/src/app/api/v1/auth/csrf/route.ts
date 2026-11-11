import { publicRoute } from "@/server/http/handler";
import { CSRF_COOKIE, csrfCookieOptions, issueCsrfToken } from "@/server/modules/identity/csrf";

/** Issue a CSRF token bound to the current session (or "anon"). */
export const GET = publicRoute({}, async (ctx) => {
  const token = issueCsrfToken(ctx.auth?.sessionId ?? "anon");
  ctx.setCookie(CSRF_COOKIE(), token, csrfCookieOptions());
  return { csrfToken: token };
});
