import { z } from "zod";
import { publicRoute } from "@/server/http/handler";
import * as diag from "@/server/modules/diagnostics/service";

/** Public (token) or workshop-restricted report view. Expiring, revocable, report-only. */
export const GET = publicRoute({ params: z.object({ token: z.string().min(20).max(64) }), rateLimit: [{ policy: "share:ip", by: "ip" }] }, async (ctx) => diag.openShare(ctx.params.token, ctx.auth?.user.id ?? null));
