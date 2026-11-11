import { publicRoute } from "@/server/http/handler";
import { looksLikeDtcQuery, SearchQuery } from "@autocare/contracts";
import { lookupDtc, textSearch } from "@/server/modules/knowledge/dtc-service";
import { getOwnedVehicle } from "@/server/modules/vehicles/service";

/** Unified search: code → coverage-aware lookup; words → symptom/part-name search. Guests allowed. */
export const GET = publicRoute({ query: SearchQuery, rateLimit: [{ policy: "search:ip", by: "ip" }] }, async (ctx) => {
  const { q, vehicleId, kind, limit } = ctx.query;
  const vehicle = vehicleId && ctx.auth ? await getOwnedVehicle(ctx.auth.user.id, vehicleId) : null;
  const vctx = vehicle ? { make: vehicle.make, model: vehicle.model, year: vehicle.year, engine: vehicle.engine, market: vehicle.salesMarket } : undefined;
  const asCode = kind === "code" || (kind === "auto" && looksLikeDtcQuery(q));
  const code = asCode ? await lookupDtc(q, vctx) : null;
  const text = kind === "code" ? [] : await textSearch(q, limit);
  return { query: q, code, text };
});
