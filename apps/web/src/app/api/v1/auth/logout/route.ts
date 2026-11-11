import { route } from "@/server/http/handler";
import { clearSessionCookies, issueSessionCookies } from "@/server/http/auth-cookies";
import * as identity from "@/server/modules/identity/service";

export const POST = route({}, async (ctx) => {
  await identity.logout(ctx.auth.sessionId, ctx.auth.user.id, { ip: ctx.ip, requestId: ctx.requestId });
  const csrfToken = clearSessionCookies(ctx.setCookie);
  return { ok: true, csrfToken };
});
