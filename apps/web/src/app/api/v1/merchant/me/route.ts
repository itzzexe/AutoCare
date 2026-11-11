import { route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";

export const GET = route({}, async (ctx) => {
  const m = await market.merchantOf(ctx.auth.user.id);
  if (!m) return { merchant: null };
  const { phoneEnc: _p, ...rest } = m;
  return { merchant: rest };
});
