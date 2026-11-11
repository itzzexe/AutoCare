import { z } from "zod";
import { route } from "@/server/http/handler";
import * as learning from "@/server/modules/learning/service";

export const GET = route({ permission: "admin:learning" }, async () => ({ items: await learning.listDatasets() }));
export const POST = route({ permission: "admin:learning", reauth: true, body: z.strictObject({ name: z.string().trim().min(3).max(80) }) }, async (ctx) => learning.buildDataset(ctx.auth.user.id, ctx.body.name, ctx.requestId));
