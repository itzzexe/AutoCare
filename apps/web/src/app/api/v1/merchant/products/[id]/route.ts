import { IdParams, route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";
import { ProductInput } from "@autocare/contracts";

export const PUT = route({ permission: "merchant:operate", params: IdParams, body: ProductInput }, async (ctx) => market.upsertProduct(ctx.auth.user.id, ctx.body, ctx.params.id, ctx.requestId));
