import { z } from "zod";
import { publicRoute } from "@/server/http/handler";
import * as ws from "@/server/modules/workshops/service";

export const GET = publicRoute({ query: z.object({ governorate: z.string().length(3).optional(), specialty: z.string().max(30).optional(), brand: z.string().max(40).optional() }) }, async (ctx) => ({ items: await ws.directory(ctx.query) }));
