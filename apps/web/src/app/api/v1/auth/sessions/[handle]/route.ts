import { z } from "zod";
import { route } from "@/server/http/handler";
import { AppError } from "@/server/lib/errors";
import { audit } from "@/server/modules/audit/audit";
import { listSessions, revokeSession } from "@/server/modules/identity/sessions";

export const DELETE = route({ params: z.object({ handle: z.string().regex(/^[a-f0-9]{16}$/) }) }, async (ctx) => {
  const rows = await listSessions(ctx.auth.user.id);
  const target = rows.find((s) => s.id.startsWith(ctx.params.handle));
  if (!target) throw new AppError("not_found");
  await revokeSession(target.id, "revoked_by_user");
  await audit({ action: "auth.session_revoked", actorUserId: ctx.auth.user.id, requestId: ctx.requestId });
  return { ok: true, wasCurrent: target.id === ctx.auth.sessionId };
});
