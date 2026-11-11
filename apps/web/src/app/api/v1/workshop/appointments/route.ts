import { route } from "@/server/http/handler";
import * as ws from "@/server/modules/workshops/service";

export const GET = route({ permission: "workshop:operate" }, async (ctx) => ({ items: await ws.workshopAppointments(ctx.auth.user.id) }));
