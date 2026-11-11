import { z } from "zod";
import { IdParams, route } from "@/server/http/handler";
import * as learning from "@/server/modules/learning/service";

export const PATCH = route({ permission: "admin:learning", reauth: true, params: IdParams, body: z.strictObject({ status: z.enum(["approved", "active", "retired"]) }) }, async (ctx) => {
  await learning.setModelStatus(ctx.auth.user.id, ctx.params.id, ctx.body.status, ctx.requestId);
  return { ok: true };
});
