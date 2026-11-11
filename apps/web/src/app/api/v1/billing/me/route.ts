import { route } from "@/server/http/handler";
import { billableSubjects, entitlementsFor, mySubscriptions } from "@/server/modules/billing/service";

export const GET = route({}, async (ctx) => {
  const uid = ctx.auth.user.id;
  const [subs, entitlements, subjects] = await Promise.all([mySubscriptions(uid), entitlementsFor("user", uid), billableSubjects(uid)]);
  return {
    entitlements,
    subjects,
    subscriptions: subs.map(({ s, p }) => ({ id: s.id, planId: s.planId, planNameAr: p.nameAr, planNameEn: p.nameEn, subjectKind: s.subjectKind, subjectId: s.subjectId, status: s.status, provider: s.provider, amountMinor: s.amountMinor, currency: s.currency, periodStart: s.periodStart, periodEnd: s.periodEnd, createdAt: s.createdAt })),
  };
});
