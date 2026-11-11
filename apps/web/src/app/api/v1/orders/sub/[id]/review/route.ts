import { IdParams, route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";
import { ReviewInput } from "@autocare/contracts";

export const POST = route({ permission: "market:buy", params: IdParams, body: ReviewInput }, async (ctx) => market.reviewMerchant(ctx.auth.user.id, ctx.params.id, ctx.body.rating, ctx.body.body));
