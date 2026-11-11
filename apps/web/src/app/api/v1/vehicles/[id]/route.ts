import { IdParams, route } from "@/server/http/handler";
import * as vehiclesSvc from "@/server/modules/vehicles/service";
import { VehicleUpdateInput } from "@autocare/contracts";

export const GET = route({ permission: "vehicle:own", params: IdParams }, async (ctx) => vehiclesSvc.toVehicleDto(await vehiclesSvc.getOwnedVehicle(ctx.auth.user.id, ctx.params.id)));
export const PATCH = route({ permission: "vehicle:own", params: IdParams, body: VehicleUpdateInput }, async (ctx) => vehiclesSvc.updateVehicle(ctx.auth.user.id, ctx.params.id, ctx.body));
export const DELETE = route({ permission: "vehicle:own", params: IdParams }, async (ctx) => {
  await vehiclesSvc.deleteVehicle(ctx.auth.user.id, ctx.params.id, ctx.requestId);
  return { ok: true };
});
