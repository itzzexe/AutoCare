import { IdParams, route } from "@/server/http/handler";
import * as vehiclesSvc from "@/server/modules/vehicles/service";

/** Reveal the full VIN to its owner. Sensitive: requires a recent re-authentication. */
export const POST = route({ permission: "vehicle:own", params: IdParams, reauth: true }, async (ctx) => ({ vin: await vehiclesSvc.revealVin(ctx.auth.user.id, ctx.params.id) }));
