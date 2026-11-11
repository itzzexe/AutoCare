import { IdParams, route } from "@/server/http/handler";
import * as learning from "@/server/modules/learning/service";

export const POST = route({ permission: "admin:learning", reauth: true, params: IdParams }, async (ctx) => learning.approveDataset(ctx.auth.user.id, ctx.params.id, ctx.requestId));
