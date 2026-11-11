import { NextResponse } from "next/server";
import { z } from "zod";
import { publicRoute } from "@/server/http/handler";
import { env } from "@/server/config/env";
import { handleGatewayReturn } from "@/server/modules/payments/service";

const Params = z.object({ gateway: z.enum(["qi_card", "zaincash"]) });

/**
 * Browser return from a hosted payment page. The query string is untrusted:
 * the outcome is confirmed with the gateway server-side before any change,
 * and the redirect target is always an internal path on APP_ORIGIN.
 */
export const GET = publicRoute({ auth: "none", params: Params, rateLimit: [{ policy: "webhook:ip", by: "ip" }], timeoutMs: 20_000 }, async (ctx) => {
  const path = await handleGatewayReturn(ctx.params.gateway, ctx.req.nextUrl.searchParams);
  return NextResponse.redirect(new URL(path, env().APP_ORIGIN), 303);
});
