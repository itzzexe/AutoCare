import { z } from "zod";
import { route } from "@/server/http/handler";
import * as admin from "@/server/modules/admin/service";

export const GET = route({ permission: "admin:audit", query: z.object({ action: z.string().max(60).optional(), before: z.iso.datetime().optional() }) }, async (ctx) => ({ items: await admin.auditLog(ctx.auth.user.id, ctx.query, ctx.requestId) }));
