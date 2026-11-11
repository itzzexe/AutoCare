import { IdParams, route } from "@/server/http/handler";
import { vehicleRecalls } from "@/server/modules/vehicles/external";

/** US recall campaigns (NHTSA) for the owner's vehicle make/model/year. */
export const GET = route({ permission: "vehicle:own", params: IdParams, rateLimit: [{ policy: "search:user", by: "user" }], timeoutMs: 12_000 }, async (ctx) =>
  vehicleRecalls(ctx.auth.user.id, ctx.params.id),
);
