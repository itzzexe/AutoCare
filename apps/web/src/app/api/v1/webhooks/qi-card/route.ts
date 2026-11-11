import { publicRoute } from "@/server/http/handler";
import { handleQiWebhook } from "@/server/modules/payments/service";

/** Qi Card payment notification. Authenticated by RSA X-Signature, not cookies. */
export const POST = publicRoute({ auth: "none", csrf: false, rawBody: "text", maxBodyBytes: 16_384, rateLimit: [{ policy: "webhook:ip", by: "ip" }] }, async (ctx) =>
  handleQiWebhook(ctx.body as unknown as string, ctx.req.headers.get("x-signature")),
);
