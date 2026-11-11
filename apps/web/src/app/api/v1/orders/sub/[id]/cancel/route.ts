import { IdParams, route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";

export const POST = route({ permission: "market:buy", params: IdParams }, async (ctx) => {
  await market.cancelMyMerchantOrder(ctx.auth.user.id, ctx.params.id);
  return { ok: true };
});
