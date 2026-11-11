import { IdParams, route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";
import { MerchantOrderStatusInput } from "@autocare/contracts";

export const PATCH = route({ permission: "merchant:operate", params: IdParams, body: MerchantOrderStatusInput }, async (ctx) => {
  await market.updateMerchantOrderStatus(ctx.auth.user.id, ctx.params.id, ctx.body.status, ctx.body.note, ctx.requestId);
  return { ok: true };
});
