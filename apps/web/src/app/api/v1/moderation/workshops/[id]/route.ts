import { z } from "zod";
import { IdParams, route } from "@/server/http/handler";
import * as ws from "@/server/modules/workshops/service";

export const PATCH = route({ permission: "moderation:merchants", params: IdParams, body: z.strictObject({ status: z.enum(["approved", "suspended", "rejected"]) }) }, async (ctx) => {
  await ws.moderateWorkshop(ctx.auth.user.id, ctx.params.id, ctx.body.status, ctx.requestId);
  return { ok: true };
});
