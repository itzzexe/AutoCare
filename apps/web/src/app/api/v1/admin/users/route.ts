import { z } from "zod";
import { route } from "@/server/http/handler";
import * as admin from "@/server/modules/admin/service";

export const GET = route({ permission: "admin:users", query: z.object({ q: z.string().trim().max(120).optional() }) }, async (ctx) => ({ items: await admin.searchUsers(ctx.auth.user.id, ctx.query.q, ctx.requestId) }));
