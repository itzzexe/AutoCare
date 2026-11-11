import { z } from "zod";
import { IdParams, route } from "@/server/http/handler";
import * as learning from "@/server/modules/learning/service";

export const POST = route({ permission: "case:submit", params: IdParams, body: z.strictObject({ outcome: z.enum(["resolved", "persisted", "partially", "unknown"]), notes: z.string().trim().max(1000).optional() }) }, async (ctx) => {
  await learning.addOutcome(ctx.auth.user.id, ctx.params.id, ctx.body.outcome, ctx.body.notes);
  return { ok: true };
});
