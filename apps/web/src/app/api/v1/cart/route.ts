import { route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";
import { CartItemInput } from "@autocare/contracts";

export const GET = route({ permission: "market:buy" }, async (ctx) => market.getCart(ctx.auth.user.id));
export const POST = route({ permission: "market:buy", body: CartItemInput, rateLimit: [{ policy: "write:user", by: "user" }] }, async (ctx) => {
  await market.addToCart(ctx.auth.user.id, ctx.body);
  return market.getCart(ctx.auth.user.id);
});
