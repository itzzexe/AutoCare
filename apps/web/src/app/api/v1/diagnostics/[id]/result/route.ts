import { z } from "zod";
import { IdParams, route } from "@/server/http/handler";
import * as diag from "@/server/modules/diagnostics/service";

/** Generates the structured result. Model failures degrade to the rules + knowledge-base result. */
export const POST = route(
  { permission: "diagnostics:own", params: IdParams, body: z.strictObject({ locale: z.enum(["ar", "en"]).default("ar") }), rateLimit: [{ policy: "ai:user", by: "user" }], timeoutMs: 150_000 },
  async (ctx) => diag.generateRecommendation(ctx.auth.user.id, ctx.params.id, ctx.body.locale, ctx.signal, ctx.requestId),
);
