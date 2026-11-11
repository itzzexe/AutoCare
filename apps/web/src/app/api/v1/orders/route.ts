import { route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";

export const GET = route({ permission: "market:buy" }, async (ctx) => ({ items: await market.myOrders(ctx.auth.user.id) }));
