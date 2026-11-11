import { route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";
import { MerchantApplyInput } from "@autocare/contracts";

export const POST = route({ body: MerchantApplyInput }, async (ctx) => {
  const m = await market.applyMerchant(ctx.auth.user.id, ctx.body, ctx.requestId);
  return { id: m.id, status: m.status };
});
