import { z } from "zod";
import { IdParams, route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";

export const PATCH = route({ permission: "moderation:content", params: IdParams, body: z.strictObject({ status: z.enum(["published", "hidden"]) }) }, async (ctx) => {
  await market.moderateReview(ctx.auth.user.id, ctx.params.id, ctx.body.status, ctx.requestId);
  return { ok: true };
});
