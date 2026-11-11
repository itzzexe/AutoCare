import { z } from "zod";
import { IdParams, route } from "@/server/http/handler";
import * as maint from "@/server/modules/maintenance/service";

export const PATCH = route({ permission: "vehicle:own", params: IdParams, body: z.strictObject({ status: z.enum(["done", "dismissed", "active"]) }) }, async (ctx) => {
  await maint.setReminderStatus(ctx.auth.user.id, ctx.params.id, ctx.body.status);
  return { ok: true };
});
