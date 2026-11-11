import { route } from "@/server/http/handler";
import * as ws from "@/server/modules/workshops/service";

export const GET = route({ permission: "moderation:merchants" }, async () => ({ items: await ws.listWorkshopsForModeration() }));
