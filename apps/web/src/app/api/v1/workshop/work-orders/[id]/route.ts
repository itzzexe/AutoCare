import { IdParams, route } from "@/server/http/handler";
import * as ws from "@/server/modules/workshops/service";
import { WorkOrderInput } from "@autocare/contracts";

export const PUT = route({ permission: "workshop:operate", params: IdParams, body: WorkOrderInput }, async (ctx) => ws.upsertWorkOrder(ctx.auth.user.id, ctx.body, ctx.params.id));
