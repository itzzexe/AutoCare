import { IdParams, route } from "@/server/http/handler";
import * as ws from "@/server/modules/workshops/service";
import { AppointmentStatusInput } from "@autocare/contracts";

/** Owner (cancel / accept reschedule) or workshop member (confirm, decline, reschedule, complete). Checked in the service. */
export const PATCH = route({ params: IdParams, body: AppointmentStatusInput }, async (ctx) => {
  await ws.setAppointmentStatus(ctx.auth.user.id, ctx.params.id, ctx.body, ctx.requestId);
  return { ok: true };
});
