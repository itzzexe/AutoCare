import { publicRoute } from "@/server/http/handler";
import { clearSessionCookies, issueSessionCookies } from "@/server/http/auth-cookies";
import * as identity from "@/server/modules/identity/service";
import { LoginInput } from "@autocare/contracts";

/**
 * Native-client login (future Android/iOS). Returns a bearer token for the OS
 * secure store; no cookies, so no CSRF. Same rate limits, MFA and audit as web.
 */
export const POST = publicRoute({ auth: "none", body: LoginInput, csrf: false }, async (ctx) => {
  const res = await identity.login(ctx.body, { ip: ctx.ip, ipPrefix: ctx.ipPrefix, requestId: ctx.requestId, userAgent: ctx.req.headers.get("user-agent"), client: "mobile" });
  if (res.status === "mfa_required") return { status: "mfa_required" };
  return { status: "ok", token: res.token, expiresAt: res.absoluteExpiresAt.toISOString() };
});
