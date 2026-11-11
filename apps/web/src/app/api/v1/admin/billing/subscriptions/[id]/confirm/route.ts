import { ManualConfirmInput } from "@autocare/contracts";
import { IdParams, route } from "@/server/http/handler";
import { confirmManualSubscription } from "@/server/modules/billing/service";

/** Records that a cash/transfer payment was received and activates the plan. */
export const POST = route({ permission: "admin:billing", reauth: true, params: IdParams, body: ManualConfirmInput }, async (ctx) => {
  await confirmManualSubscription(ctx.auth.user.id, ctx.params.id, ctx.body.note, ctx.requestId);
  return { ok: true };
});
