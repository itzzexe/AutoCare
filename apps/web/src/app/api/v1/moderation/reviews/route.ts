import { route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";

export const GET = route({ permission: "moderation:content" }, async () => ({ items: await market.flaggedReviews() }));
