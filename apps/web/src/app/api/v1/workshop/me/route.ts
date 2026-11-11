import { route } from "@/server/http/handler";
import * as ws from "@/server/modules/workshops/service";

export const GET = route({}, async (ctx) => {
  const r = await ws.workshopOf(ctx.auth.user.id);
  if (!r) return { workshop: null };
  const { phoneEnc: _p, ...rest } = r.w;
  return { workshop: rest, role: r.role };
});
