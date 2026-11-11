import { IdParams, route } from "@/server/http/handler";
import * as diag from "@/server/modules/diagnostics/service";
import { ShareCreateInput } from "@autocare/contracts";

export const GET = route({ permission: "diagnostics:own", params: IdParams }, async (ctx) => ({ items: await diag.listShares(ctx.auth.user.id, ctx.params.id) }));
export const POST = route({ permission: "diagnostics:own", params: IdParams, body: ShareCreateInput }, async (ctx) => diag.createShare(ctx.auth.user.id, ctx.params.id, ctx.body.ttlHours, ctx.body.workshopId, ctx.requestId));
