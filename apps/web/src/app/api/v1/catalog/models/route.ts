import { z } from "zod";
import { route } from "@/server/http/handler";
import { modelSuggestions } from "@/server/modules/vehicles/external";

const Query = z.strictObject({
  make: z.string().trim().min(1).max(60).regex(/^[\p{L}\p{N} .&-]+$/u),
  year: z.coerce.number().int().min(1996).max(new Date().getFullYear() + 1),
});

/** Model names for a make/year from NHTSA vPIC (autocomplete only; the user still types/chooses). */
export const GET = route({ permission: "vehicle:own", query: Query, rateLimit: [{ policy: "search:user", by: "user" }], timeoutMs: 12_000 }, async (ctx) =>
  modelSuggestions(ctx.query.make, ctx.query.year),
);
