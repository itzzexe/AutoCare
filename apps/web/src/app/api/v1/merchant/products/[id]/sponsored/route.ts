import { z } from "zod";
import { IdParams, route } from "@/server/http/handler";
import { setProductSponsored } from "@/server/modules/market/service";

const Body = z.strictObject({ sponsored: z.boolean() });

export const PUT = route({ permission: "merchant:operate", params: IdParams, body: Body }, async (ctx) =>
  setProductSponsored(ctx.auth.user.id, ctx.params.id, ctx.body.sponsored, ctx.requestId),
);
