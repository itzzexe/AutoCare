import { route } from "@/server/http/handler";
import * as vehiclesSvc from "@/server/modules/vehicles/service";
import { VinDecodeInput } from "@autocare/contracts";

export const POST = route({ permission: "vehicle:own", body: VinDecodeInput, timeoutMs: 20_000 }, async (ctx) => vehiclesSvc.decodeVin(ctx.auth.user.id, ctx.body.vin, ctx.body.modelYear, ctx.requestId));
