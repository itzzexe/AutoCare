import { IdParams, route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";

export const DELETE = route({ permission: "market:buy", params: IdParams }, async (ctx) => {
  await market.removeFromCart(ctx.auth.user.id, ctx.params.id);
  return market.getCart(ctx.auth.user.id);
});
