import { IdParams, route } from "@/server/http/handler";
import * as maint from "@/server/modules/maintenance/service";
import { MaintenanceRecordInput } from "@autocare/contracts";

export const GET = route({ permission: "vehicle:own", params: IdParams }, async (ctx) => ({ items: await maint.listRecords(ctx.auth.user.id, ctx.params.id) }));
export const POST = route({ permission: "vehicle:own", params: IdParams, body: MaintenanceRecordInput }, async (ctx) => maint.addRecord(ctx.auth.user.id, ctx.params.id, ctx.body));
