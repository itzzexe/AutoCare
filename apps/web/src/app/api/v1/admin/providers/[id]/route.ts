import { z } from "zod";
import { route } from "@/server/http/handler";
import * as admin from "@/server/modules/admin/service";

const ProviderId = z.enum(["nhtsa_vpic", "nhtsa_recalls", "oem_licensed", "carsxe", "autodata", "tecrmi", "tecalliance_cn", "internal_curated"]);

export const PATCH = route({ permission: "admin:providers", reauth: true, params: z.object({ id: ProviderId }), body: z.strictObject({ enabled: z.boolean(), note: z.string().trim().min(3).max(300) }) }, async (ctx) => {
  await admin.setProviderEnabled(ctx.auth.user.id, ctx.params.id, ctx.body.enabled, ctx.body.note, ctx.requestId);
  return { ok: true };
});
