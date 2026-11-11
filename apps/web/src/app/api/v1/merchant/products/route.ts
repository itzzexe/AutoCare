import { route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";
import { ProductInput } from "@autocare/contracts";

export const GET = route({ permission: "merchant:operate" }, async (ctx) => ({ items: await market.myProducts(ctx.auth.user.id) }));
export const POST = route({ permission: "merchant:operate", body: ProductInput }, async (ctx) => market.upsertProduct(ctx.auth.user.id, ctx.body, undefined, ctx.requestId));
