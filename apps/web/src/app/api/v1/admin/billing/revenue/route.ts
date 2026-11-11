import { z } from "zod";
import { route } from "@/server/http/handler";
import { revenueSummary } from "@/server/modules/billing/service";

const Query = z.strictObject({ days: z.coerce.number().int().min(1).max(366).default(30) });

export const GET = route({ permission: "admin:billing", query: Query }, async (ctx) => revenueSummary(ctx.query.days));
