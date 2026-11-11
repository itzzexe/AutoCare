import { z } from "zod";
import { route } from "@/server/http/handler";
import * as account from "@/server/modules/account/service";
import { sweepDueReminders } from "@/server/modules/maintenance/service";

export const GET = route({}, async (ctx) => {
  await sweepDueReminders(ctx.auth.user.id);
  return { items: await account.myNotifications(ctx.auth.user.id) };
});
export const POST = route({ body: z.strictObject({ markAllRead: z.literal(true) }) }, async (ctx) => {
  await account.markNotificationsRead(ctx.auth.user.id);
  return { ok: true };
});
