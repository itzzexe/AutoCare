import { z } from "zod";
import { route } from "@/server/http/handler";
import { adminSubscriptions } from "@/server/modules/billing/service";

const Query = z.strictObject({ status: z.enum(["pending_payment", "pending_manual", "active", "expired", "cancelled", "failed"]).optional() });

export const GET = route({ permission: "admin:billing", query: Query }, async (ctx) => ({
  subscriptions: (await adminSubscriptions(ctx.query.status)).map(({ s, p }) => ({ ...s, planNameAr: p.nameAr, planNameEn: p.nameEn })),
}));
