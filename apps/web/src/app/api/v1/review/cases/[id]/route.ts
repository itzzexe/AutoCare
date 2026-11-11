import { IdParams, route } from "@/server/http/handler";
import * as learning from "@/server/modules/learning/service";
import { ReviewDecisionInput } from "@autocare/contracts";

export const POST = route({ permission: "cases:review", params: IdParams, body: ReviewDecisionInput }, async (ctx) => {
  await learning.reviewCase(ctx.auth.user.id, ctx.params.id, ctx.body, ctx.requestId);
  return { ok: true };
});
