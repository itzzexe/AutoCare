import { IdParams, route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";

export const POST = route({ permission: "moderation:content", params: IdParams }, async (ctx) => {
  await market.verifyAuthenticity(ctx.auth.user.id, ctx.params.id, ctx.requestId);
  return { ok: true };
});
