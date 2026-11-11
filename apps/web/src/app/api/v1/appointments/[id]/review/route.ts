import { IdParams, route } from "@/server/http/handler";
import * as ws from "@/server/modules/workshops/service";
import { ReviewInput } from "@autocare/contracts";

export const POST = route({ permission: "workshop:book", params: IdParams, body: ReviewInput }, async (ctx) => ws.reviewWorkshop(ctx.auth.user.id, ctx.params.id, ctx.body.rating, ctx.body.body));
