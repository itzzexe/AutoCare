import { route } from "@/server/http/handler";
import * as market from "@/server/modules/market/service";

export const GET = route({ permission: "moderation:merchants" }, async () => ({ items: await market.listMerchantsForModeration() }));
