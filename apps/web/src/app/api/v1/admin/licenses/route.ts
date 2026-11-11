import { z } from "zod";
import { route } from "@/server/http/handler";
import * as admin from "@/server/modules/admin/service";

const ProviderId = z.enum(["nhtsa_vpic", "nhtsa_recalls", "oem_licensed", "carsxe", "autodata", "tecrmi", "tecalliance_cn", "internal_curated"]);

const Body = z.strictObject({
  providerId: ProviderId,
  version: z.string().trim().min(1).max(40),
  allowDisplay: z.boolean(), allowCache: z.boolean(), cacheTtlSeconds: z.int().min(0).max(31_536_000),
  allowTranslation: z.boolean(), allowOffline: z.boolean(), allowEmbeddings: z.boolean(), allowTraining: z.boolean(), allowRedistribution: z.boolean(),
  validFrom: z.iso.datetime({ offset: true }), validUntil: z.iso.datetime({ offset: true }).optional(),
  agreementRef: z.string().trim().min(3).max(300), notes: z.string().trim().max(1000).optional(),
});
export const POST = route({ permission: "admin:providers", reauth: true, body: Body }, async (ctx) => admin.recordLicensePolicy(ctx.auth.user.id, ctx.body, ctx.requestId));
