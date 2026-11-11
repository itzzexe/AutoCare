import { z } from "zod";
import { PlanId, PlanUpdateInput } from "@autocare/contracts";
import { route } from "@/server/http/handler";
import { adminUpdatePlan } from "@/server/modules/billing/service";

const Params = z.object({ id: PlanId });

/** Price changes are financial: re-authentication required. */
export const PATCH = route({ permission: "admin:billing", reauth: true, params: Params, body: PlanUpdateInput }, async (ctx) =>
  adminUpdatePlan(ctx.auth.user.id, ctx.params.id, ctx.body, ctx.requestId),
);
