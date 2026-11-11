import { SubscribeInput } from "@autocare/contracts";
import { route } from "@/server/http/handler";
import { getLocale } from "@/i18n/server";
import { startSubscription } from "@/server/modules/billing/service";

export const POST = route({ body: SubscribeInput, rateLimit: [{ policy: "order:user", by: "user" }], timeoutMs: 20_000 }, async (ctx) =>
  startSubscription(
    ctx.auth.user.id,
    { planId: ctx.body.planId, subjectKind: ctx.body.subjectKind, subjectId: ctx.body.subjectKind === "user" ? ctx.auth.user.id : (ctx.body.subjectId ?? ""), method: ctx.body.method, locale: await getLocale() },
    ctx.requestId,
  ),
);
