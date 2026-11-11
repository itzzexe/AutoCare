import { route } from "@/server/http/handler";
import { clearSessionCookies, issueSessionCookies } from "@/server/http/auth-cookies";
import * as identity from "@/server/modules/identity/service";

export const POST = route({ reauth: true }, async (ctx) => {
  if (ctx.auth.user.mfaEnabled) return { alreadyEnabled: true };
  return identity.startMfaEnrollment(ctx.auth.user.id, ctx.auth.user.email);
});
