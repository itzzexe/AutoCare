import { z } from "zod";
import { route } from "@/server/http/handler";
import * as learning from "@/server/modules/learning/service";

const Body = z.strictObject({ name: z.string().trim().min(2).max(80), baseModel: z.string().trim().min(2).max(80), license: z.string().trim().min(2).max(80), adapterRef: z.string().trim().max(200).optional(), datasetVersionId: z.uuid().optional(), notes: z.string().trim().max(1000).optional() });
export const GET = route({ permission: "admin:learning" }, async () => ({ items: await learning.listModels(), evaluations: await learning.listEvaluationRuns() }));
export const POST = route({ permission: "admin:learning", reauth: true, body: Body }, async (ctx) => learning.registerModel(ctx.auth.user.id, ctx.body, ctx.requestId));
