import { IdParams, route } from "@/server/http/handler";
import * as diag from "@/server/modules/diagnostics/service";
import { CheckResultInput } from "@autocare/contracts";

export const POST = route({ permission: "diagnostics:own", params: IdParams, body: CheckResultInput }, async (ctx) => {
  await diag.recordCheck(ctx.auth.user.id, ctx.params.id, ctx.body);
  return { ok: true };
});
