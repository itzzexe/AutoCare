import { route } from "@/server/http/handler";
import { RoleChangeInput } from "@autocare/contracts";
import { changeRole } from "@/server/modules/identity/service";

export const POST = route({ permission: "admin:users", reauth: true, body: RoleChangeInput }, async (ctx) => {
  await changeRole(ctx.auth.user.id, ctx.body.userId, ctx.body.role, ctx.body.action, ctx.body.reason, { ip: ctx.ip, ipPrefix: ctx.ipPrefix, requestId: ctx.requestId });
  return { ok: true };
});
