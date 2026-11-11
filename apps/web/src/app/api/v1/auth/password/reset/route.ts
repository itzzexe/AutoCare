import { publicRoute } from "@/server/http/handler";
import { clearSessionCookies, issueSessionCookies } from "@/server/http/auth-cookies";
import * as identity from "@/server/modules/identity/service";
import { ResetPasswordInput } from "@autocare/contracts";

export const POST = publicRoute({ auth: "none", body: ResetPasswordInput }, async (ctx) => {
  await identity.resetPassword(ctx.body.token, ctx.body.password, { ip: ctx.ip, ipPrefix: ctx.ipPrefix, requestId: ctx.requestId });
  return { ok: true };
});
