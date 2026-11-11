import { route } from "@/server/http/handler";
import * as ws from "@/server/modules/workshops/service";
import { WorkshopApplyInput } from "@autocare/contracts";

export const POST = route({ body: WorkshopApplyInput }, async (ctx) => {
  const w = await ws.applyWorkshop(ctx.auth.user.id, ctx.body, ctx.requestId);
  return { id: w.id, status: w.status };
});
