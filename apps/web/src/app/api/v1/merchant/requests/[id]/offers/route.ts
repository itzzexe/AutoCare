import { IdParams, route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";
import { OfferInput } from "@autocare/contracts";

export const POST = route({ permission: "merchant:operate", params: IdParams, body: OfferInput }, async (ctx) => market.submitOffer(ctx.auth.user.id, ctx.params.id, ctx.body));
