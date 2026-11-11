import { route } from "@/server/http/handler";
import * as ws from "@/server/modules/workshops/service";
import { WorkOrderInput } from "@autocare/contracts";

export const POST = route({ permission: "workshop:operate", body: WorkOrderInput }, async (ctx) => ws.upsertWorkOrder(ctx.auth.user.id, ctx.body));
