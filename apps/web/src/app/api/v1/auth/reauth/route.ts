import { route } from "@/server/http/handler";
import { clearSessionCookies, issueSessionCookies } from "@/server/http/auth-cookies";
import * as identity from "@/server/modules/identity/service";
import { ReauthInput } from "@autocare/contracts";

export const POST = route({ body: ReauthInput }, async (ctx) => {
  await identity.reauthenticate(ctx.auth.user.id, ctx.auth.sessionId, ctx.body.password, ctx.body.totp, { ip: ctx.ip, requestId: ctx.requestId });
  return { ok: true };
});
