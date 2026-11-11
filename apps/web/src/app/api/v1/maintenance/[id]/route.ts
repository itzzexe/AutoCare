import { IdParams, route } from "@/server/http/handler";
import * as maint from "@/server/modules/maintenance/service";

export const DELETE = route({ permission: "vehicle:own", params: IdParams }, async (ctx) => {
  await maint.deleteRecord(ctx.auth.user.id, ctx.params.id);
  return { ok: true };
});
