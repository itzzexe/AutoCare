import { route } from "@/server/http/handler";
import * as learning from "@/server/modules/learning/service";
import { RepairCaseInput } from "@autocare/contracts";

export const GET = route({ permission: "case:submit" }, async (ctx) => ({ items: await learning.listMyCases(ctx.auth.user.id) }));
export const POST = route({ permission: "case:submit", body: RepairCaseInput, rateLimit: [{ policy: "write:user", by: "user" }] }, async (ctx) => learning.submitCase(ctx.auth.user.id, ctx.body, ctx.requestId));
