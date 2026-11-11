import { publicRoute } from "@/server/http/handler";
import { clearSessionCookies, issueSessionCookies } from "@/server/http/auth-cookies";
import * as identity from "@/server/modules/identity/service";
import { LoginInput } from "@autocare/contracts";

export const POST = publicRoute({ body: LoginInput }, async (ctx) => {
  const res = await identity.login(ctx.body, {
    ip: ctx.ip,
    ipPrefix: ctx.ipPrefix,
    requestId: ctx.requestId,
    userAgent: ctx.req.headers.get("user-agent"),
    previousSessionId: ctx.auth?.sessionId,
    client: "web",
  });
  if (res.status === "mfa_required") return { status: "mfa_required" };
  const csrfToken = issueSessionCookies(ctx.setCookie, res);
  return { status: "ok", csrfToken };
});
