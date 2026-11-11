import { route } from "@/server/http/handler";
import { clearSessionCookies, issueSessionCookies } from "@/server/http/auth-cookies";
import * as identity from "@/server/modules/identity/service";

export const POST = route({ reauth: true }, async (ctx) => {
  await identity.disableMfa(ctx.auth.user.id, { ip: ctx.ip, requestId: ctx.requestId });
  return { ok: true };
});
