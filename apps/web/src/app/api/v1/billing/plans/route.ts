import { publicRoute } from "@/server/http/handler";
import { publicPlans } from "@/server/modules/billing/service";
import { availableGateways } from "@/server/modules/payments/gateways";

/** Published plans with prices, plus which payment rails are switched on. */
export const GET = publicRoute({ auth: "optional", rateLimit: [{ policy: "search:ip", by: "ip" }] }, async () => ({
  plans: (await publicPlans()).map((p) => ({ id: p.id, audience: p.audience, tier: p.tier, nameAr: p.nameAr, nameEn: p.nameEn, descriptionAr: p.descriptionAr, descriptionEn: p.descriptionEn, priceMinor: p.priceMinor, currency: p.currency, periodDays: p.periodDays, entitlements: p.entitlements })),
  gateways: availableGateways().map((g) => ({ id: g.id, nameAr: g.nameAr, nameEn: g.nameEn, minAmountIqd: g.minAmountIqd })),
  manual: true,
}));
