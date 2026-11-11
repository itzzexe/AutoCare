import { route } from "@/server/http/handler";
import * as ws from "@/server/modules/workshops/service";
import { AppointmentInput } from "@autocare/contracts";

export const GET = route({ permission: "workshop:book" }, async (ctx) => ({ items: await ws.myAppointments(ctx.auth.user.id) }));
export const POST = route({ permission: "workshop:book", body: AppointmentInput, rateLimit: [{ policy: "write:user", by: "user" }] }, async (ctx) => ws.bookAppointment(ctx.auth.user.id, ctx.body, ctx.requestId));
