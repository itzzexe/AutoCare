import { route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";

export const GET = route({ permission: "merchant:operate" }, async (ctx) => ({ items: await market.merchantOrdersFor(ctx.auth.user.id) }));
