import { route } from "@/server/http/handler";
import * as vehiclesSvc from "@/server/modules/vehicles/service";
import { VehicleInput } from "@autocare/contracts";

export const GET = route({ permission: "vehicle:own" }, async (ctx) => ({ items: await vehiclesSvc.listVehicles(ctx.auth.user.id) }));
export const POST = route({ permission: "vehicle:own", body: VehicleInput, rateLimit: [{ policy: "write:user", by: "user" }] }, async (ctx) => vehiclesSvc.createVehicle(ctx.auth.user.id, ctx.body));
