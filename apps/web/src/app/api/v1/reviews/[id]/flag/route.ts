import { IdParams, route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";

export const POST = route({ params: IdParams, rateLimit: [{ policy: "write:user", by: "user" }] }, async (ctx) => {
  await market.flagReview(ctx.params.id);
  return { ok: true };
});
