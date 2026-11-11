import { IdParams, route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";
import { ReturnRequestInput } from "@autocare/contracts";

export const POST = route({ permission: "market:buy", params: IdParams, body: ReturnRequestInput }, async (ctx) => {
  await market.requestReturn(ctx.auth.user.id, ctx.params.id, ctx.body.reason, ctx.requestId);
  return { ok: true };
});
