import { route } from "@/server/http/handler";
import { listSessions } from "@/server/modules/identity/sessions";

export const GET = route({}, async (ctx) => {
  const rows = await listSessions(ctx.auth.user.id);
  // Session ids are hashes of tokens; expose only a short handle and whether it is the current one.
  return { items: rows.map((s) => ({ handle: s.id.slice(0, 16), current: s.id === ctx.auth.sessionId, client: s.client, userAgent: s.userAgent, ipPrefix: s.ipPrefix, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, expiresAt: s.absoluteExpiresAt })) };
});
