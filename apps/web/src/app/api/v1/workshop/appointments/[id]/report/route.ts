import { IdParams, route } from "@/server/http/handler";
import * as ws from "@/server/modules/workshops/service";

/** Report shared by the owner with this workshop (membership + live share required). */
export const GET = route({ permission: "workshop:operate", params: IdParams }, async (ctx) => ws.sharedReportForAppointment(ctx.auth.user.id, ctx.params.id));
