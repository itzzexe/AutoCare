import { IdParams, route } from "@/server/http/handler";
import * as ws from "@/server/modules/workshops/service";

export const GET = route({ permission: "workshop:book", params: IdParams }, async (ctx) => ({ items: await ws.myWorkOrders(ctx.auth.user.id, ctx.params.id) }));
