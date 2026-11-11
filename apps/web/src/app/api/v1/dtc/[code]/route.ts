import { z } from "zod";
import { publicRoute } from "@/server/http/handler";
import { AppError } from "@/server/lib/errors";
import { lookupDtc } from "@/server/modules/knowledge/dtc-service";
import { getOwnedVehicle } from "@/server/modules/vehicles/service";

export const GET = publicRoute(
  { params: z.object({ code: z.string().min(2).max(16) }), query: z.object({ vehicleId: z.uuid().optional() }), rateLimit: [{ policy: "search:ip", by: "ip" }] },
  async (ctx) => {
    const vehicle = ctx.query.vehicleId && ctx.auth ? await getOwnedVehicle(ctx.auth.user.id, ctx.query.vehicleId) : null;
    const res = await lookupDtc(decodeURIComponent(ctx.params.code), vehicle ? { make: vehicle.make, model: vehicle.model, year: vehicle.year, engine: vehicle.engine, market: vehicle.salesMarket } : undefined);
    if (!res) throw new AppError("not_found", "not_a_recognised_code");
    return res;
  },
);
