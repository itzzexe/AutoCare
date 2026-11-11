import { IdParams, route } from "@/server/http/handler";
import * as diag from "@/server/modules/diagnostics/service";

export const DELETE = route({ permission: "diagnostics:own", params: IdParams }, async (ctx) => {
  await diag.revokeShare(ctx.auth.user.id, ctx.params.id, ctx.requestId);
  return { ok: true };
});
