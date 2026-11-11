import { IdParams, route } from "@/server/http/handler";
import * as maint from "@/server/modules/maintenance/service";
import { ReminderInput } from "@autocare/contracts";

export const GET = route({ permission: "vehicle:own", params: IdParams }, async (ctx) => ({ items: await maint.listReminders(ctx.auth.user.id, ctx.params.id) }));
export const POST = route({ permission: "vehicle:own", params: IdParams, body: ReminderInput }, async (ctx) => maint.addReminder(ctx.auth.user.id, ctx.params.id, ctx.body));
