import { publicRoute } from "@/server/http/handler";
import { clearSessionCookies, issueSessionCookies } from "@/server/http/auth-cookies";
import * as identity from "@/server/modules/identity/service";
import { VerifyEmailInput } from "@autocare/contracts";

export const POST = publicRoute({ auth: "none", body: VerifyEmailInput }, async (ctx) => {
  await identity.verifyEmail(ctx.body.token, { ip: ctx.ip, requestId: ctx.requestId });
  return { ok: true };
});
