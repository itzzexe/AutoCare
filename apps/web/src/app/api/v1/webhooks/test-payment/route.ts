import { publicRoute } from "@/server/http/handler";
import { env } from "@/server/config/env";
import { handleTestPaymentWebhook } from "@/server/modules/market/service";

/** Test-mode payment gateway webhook. Authenticated by HMAC signature, not cookies. */
export const POST = publicRoute({ auth: "none", csrf: false, rawBody: "text", rateLimit: [{ policy: "webhook:ip", by: "ip" }] }, async (ctx) =>
  handleTestPaymentWebhook(ctx.body as unknown as string, ctx.req.headers.get("x-test-signature"), env().PAYMENT_TEST_WEBHOOK_SECRET),
);
