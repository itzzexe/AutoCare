import { IdParams, route } from "@/server/http/handler";
import { rejectManualSubscription } from "@/server/modules/billing/service";

export const POST = route({ permission: "admin:billing", params: IdParams }, async (ctx) => {
  await rejectManualSubscription(ctx.auth.user.id, ctx.params.id, ctx.requestId);
  return { ok: true };
});
