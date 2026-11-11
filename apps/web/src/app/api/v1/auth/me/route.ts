import { publicRoute } from "@/server/http/handler";

export const GET = publicRoute({}, async (ctx) => {
  if (!ctx.auth) return { user: null };
  const u = ctx.auth.user;
  return { user: { id: u.id, email: u.email, displayName: u.displayName, locale: u.locale, emailVerified: u.emailVerified, mfaEnabled: u.mfaEnabled, roles: u.roles, mfaVerified: ctx.auth.mfaVerified } };
});
