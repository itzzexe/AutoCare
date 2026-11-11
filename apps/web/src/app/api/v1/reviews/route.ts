import { z } from "zod";
import { publicRoute } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";

export const GET = publicRoute({ query: z.object({ kind: z.enum(["merchant", "workshop"]), id: z.uuid() }) }, async (ctx) => market.publicReviews(ctx.query.kind, ctx.query.id));
