import { route } from "@/server/http/handler";
import * as diag from "@/server/modules/diagnostics/service";
import { DiagnosticStartInput } from "@autocare/contracts";

export const GET = route({ permission: "diagnostics:own" }, async (ctx) => ({ items: await diag.listSessions(ctx.auth.user.id) }));
export const POST = route({ permission: "diagnostics:own", body: DiagnosticStartInput, rateLimit: [{ policy: "write:user", by: "user" }] }, async (ctx) => diag.startSession(ctx.auth.user.id, ctx.body));
