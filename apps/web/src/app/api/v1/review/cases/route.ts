import { route } from "@/server/http/handler";
import * as learning from "@/server/modules/learning/service";

export const GET = route({ permission: "cases:review" }, async (ctx) => ({ items: await learning.reviewQueue(ctx.auth.user.id) }));
