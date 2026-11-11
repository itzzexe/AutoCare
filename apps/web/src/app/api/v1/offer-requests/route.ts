import { route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";
import { OfferRequestInput } from "@autocare/contracts";

export const GET = route({ permission: "market:buy" }, async (ctx) => ({ items: await market.myOfferRequests(ctx.auth.user.id) }));
export const POST = route({ permission: "market:buy", body: OfferRequestInput, rateLimit: [{ policy: "offer_request:user", by: "user" }] }, async (ctx) => market.createOfferRequest(ctx.auth.user.id, ctx.body));
