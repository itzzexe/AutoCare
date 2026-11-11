import { z } from "zod";
import { publicRoute } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";
import { getOwnedVehicle } from "@/server/modules/vehicles/service";

export const GET = publicRoute(
  { query: z.object({ q: z.string().trim().max(120).optional(), vehicleId: z.uuid().optional(), governorate: z.string().length(3).optional(), limit: z.coerce.number().int().min(1).max(50).default(24) }), rateLimit: [{ policy: "search:ip", by: "ip" }] },
  async (ctx) => {
    const v = ctx.query.vehicleId && ctx.auth ? await getOwnedVehicle(ctx.auth.user.id, ctx.query.vehicleId) : null;
    return { items: await market.searchCatalog({ q: ctx.query.q, governorate: ctx.query.governorate, limit: ctx.query.limit, vehicle: v ? { make: v.make, model: v.model, year: v.year, engine: v.engine } : undefined }) };
  },
);
