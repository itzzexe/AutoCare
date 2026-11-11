import { route } from "@/server/http/handler";
import { clearSessionCookies, issueSessionCookies } from "@/server/http/auth-cookies";
import * as identity from "@/server/modules/identity/service";
import { MfaConfirmInput } from "@autocare/contracts";

export const POST = route({ body: MfaConfirmInput }, async (ctx) => {
  const s = await identity.confirmMfa(ctx.auth.user.id, ctx.auth.sessionId, ctx.body.totp, { ip: ctx.ip, requestId: ctx.requestId, userAgent: ctx.req.headers.get("user-agent"), ipPrefix: ctx.ipPrefix });
  const csrfToken = issueSessionCookies(ctx.setCookie, s);
  return { ok: true, csrfToken };
});
