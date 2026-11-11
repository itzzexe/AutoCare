import { IdParams, route } from "@/server/http/handler";
import * as diag from "@/server/modules/diagnostics/service";

export const GET = route({ permission: "diagnostics:own", params: IdParams }, async (ctx) => diag.getSessionDetail(ctx.auth.user.id, ctx.params.id));
