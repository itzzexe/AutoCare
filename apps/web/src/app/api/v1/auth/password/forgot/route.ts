import { publicRoute } from "@/server/http/handler";
import { clearSessionCookies, issueSessionCookies } from "@/server/http/auth-cookies";
import * as identity from "@/server/modules/identity/service";
import { RequestResetInput } from "@autocare/contracts";

export const POST = publicRoute({ auth: "none", body: RequestResetInput }, async (ctx) => {
  await identity.requestPasswordReset(ctx.body.email, { ip: ctx.ip, ipPrefix: ctx.ipPrefix, requestId: ctx.requestId });
  // Same answer whether or not the account exists.
  return { status: "if_account_exists_email_sent" };
});
