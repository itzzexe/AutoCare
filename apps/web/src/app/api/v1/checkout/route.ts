import { route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";
import { CheckoutInput } from "@autocare/contracts";
import { AppError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import { isGateway, startOrderPayment } from "@/server/modules/payments/service";
import { getLocale } from "@/i18n/server";

/** Requires an Idempotency-Key header. Prices are computed on the server only. */
export const POST = route({ permission: "market:buy", body: CheckoutInput, rateLimit: [{ policy: "order:user", by: "user" }] }, async (ctx) => {
  if (!ctx.auth.user.emailVerified) throw new AppError("forbidden", "email_verification_required");
  const r = await market.checkout(ctx.auth.user.id, ctx.req.headers.get("idempotency-key") ?? "", ctx.body, ctx.requestId);
  if (!isGateway(ctx.body.paymentMethod)) return r;
  try {
    const p = await startOrderPayment(ctx.auth.user.id, r.orderId, await getLocale(), ctx.requestId);
    return { ...r, redirectUrl: p.redirectUrl };
  } catch (e) {
    // The order exists; the buyer can retry payment from the orders page.
    logger.warn({ orderId: r.orderId, code: (e as AppError).code }, "gateway initiation failed after order placement");
    return { ...r, redirectUrl: null, paymentInitFailed: true };
  }
});
