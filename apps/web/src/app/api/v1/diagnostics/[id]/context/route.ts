import { IdParams, route } from "@/server/http/handler";
import * as diag from "@/server/modules/diagnostics/service";
import { DiagnosticContextInput } from "@autocare/contracts";

export const PUT = route({ permission: "diagnostics:own", params: IdParams, body: DiagnosticContextInput }, async (ctx) => diag.updateContext(ctx.auth.user.id, ctx.params.id, ctx.body));
