import { z } from "zod";
import { IdParams, route } from "@/server/http/handler";
import * as vehiclesSvc from "@/server/modules/vehicles/service";
import { VinDecodeInput } from "@autocare/contracts";

const Body = z.strictObject({ vin: VinDecodeInput.shape.vin, modelYear: VinDecodeInput.shape.modelYear });
/** Re-decodes server-side (never trusts decode data posted by the browser) and stores it after the owner confirmed. */
export const POST = route({ permission: "vehicle:own", params: IdParams, body: Body, timeoutMs: 20_000 }, async (ctx) => {
  const r = await vehiclesSvc.decodeVin(ctx.auth.user.id, ctx.body.vin, ctx.body.modelYear, ctx.requestId);
  if (!r.result) return { stored: false, providerState: r.providerState };
  await vehiclesSvc.updateVehicle(ctx.auth.user.id, ctx.params.id, { vin: ctx.body.vin });
  await vehiclesSvc.attachConfirmedDecode(ctx.auth.user.id, ctx.params.id, r.result, r.provider);
  return { stored: true };
});
