import { route } from "@/server/http/handler";
import { entitlementsFor, merchantStatement } from "@/server/modules/billing/service";
import { approvedMerchantOf } from "@/server/modules/market/service";

/** The merchant's own commission ledger. */
export const GET = route({ permission: "merchant:operate" }, async (ctx) => {
  const m = await approvedMerchantOf(ctx.auth.user.id);
  const [statement, entitlements] = await Promise.all([merchantStatement(m.id), entitlementsFor("merchant", m.id)]);
  return { merchantId: m.id, entitlements, ...statement };
});
