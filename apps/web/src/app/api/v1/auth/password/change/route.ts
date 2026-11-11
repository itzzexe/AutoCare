import { route } from "@/server/http/handler";
import { clearSessionCookies, issueSessionCookies } from "@/server/http/auth-cookies";
import * as identity from "@/server/modules/identity/service";
import { ChangePasswordInput } from "@autocare/contracts";

export const POST = route({ body: ChangePasswordInput, rateLimit: [{ policy: "login:ip", by: "ip" }] }, async (ctx) => {
  const s = await identity.changePassword(ctx.auth.user.id, ctx.auth.sessionId, ctx.body.currentPassword, ctx.body.newPassword, { ip: ctx.ip, ipPrefix: ctx.ipPrefix, requestId: ctx.requestId, userAgent: ctx.req.headers.get("user-agent") });
  const csrfToken = issueSessionCookies(ctx.setCookie, s);
  return { ok: true, csrfToken };
});
