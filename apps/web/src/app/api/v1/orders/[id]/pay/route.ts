import { IdParams, route } from "@/server/http/handler";
import { getLocale } from "@/i18n/server";
import { startOrderPayment } from "@/server/modules/payments/service";

/** (Re)starts the hosted gateway payment for one of the buyer's own online orders. */
export const POST = route({ permission: "market:buy", params: IdParams, rateLimit: [{ policy: "order:user", by: "user" }], timeoutMs: 20_000 }, async (ctx) =>
  startOrderPayment(ctx.auth.user.id, ctx.params.id, await getLocale(), ctx.requestId),
);
