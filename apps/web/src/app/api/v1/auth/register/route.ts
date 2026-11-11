import { publicRoute } from "@/server/http/handler";
import { clearSessionCookies, issueSessionCookies } from "@/server/http/auth-cookies";
import * as identity from "@/server/modules/identity/service";
import { RegisterInput } from "@autocare/contracts";

export const POST = publicRoute({ auth: "none", body: RegisterInput }, async (ctx) =>
  identity.register(ctx.body, { ip: ctx.ip, ipPrefix: ctx.ipPrefix, requestId: ctx.requestId }),
);
