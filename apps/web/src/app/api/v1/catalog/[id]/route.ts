import { z } from "zod";
import { IdParams, publicRoute } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";
import { getOwnedVehicle } from "@/server/modules/vehicles/service";

export const GET = publicRoute({ params: IdParams, query: z.object({ vehicleId: z.uuid().optional() }) }, async (ctx) => {
  const v = ctx.query.vehicleId && ctx.auth ? await getOwnedVehicle(ctx.auth.user.id, ctx.query.vehicleId) : null;
  return market.productDetail(ctx.params.id, v ? { make: v.make, model: v.model, year: v.year, engine: v.engine } : undefined);
});
