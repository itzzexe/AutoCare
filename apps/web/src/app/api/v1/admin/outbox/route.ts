import { route } from "@/server/http/handler";
import * as admin from "@/server/modules/admin/service";

export const GET = route({ permission: "admin:dev_outbox" }, async (ctx) => ({ items: await admin.devOutbox(ctx.auth.user.id, ctx.requestId) }));
