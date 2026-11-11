import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { CSRF_COOKIE } from "../modules/identity/csrf";
import type { Permission } from "../modules/identity/rbac";
import { SESSION_COOKIE, validateSessionToken, type AuthContext } from "../modules/identity/sessions";

/** Auth for Server Components (per-request cached). Same validation as the API. */
export const currentAuth = cache(async (): Promise<AuthContext | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE())?.value;
  if (!token) return null;
  const ctx = await validateSessionToken(token);
  return ctx && ctx.client === "web" ? ctx : null;
});

export async function requireAuth(next = "/"): Promise<AuthContext> {
  const a = await currentAuth();
  if (!a) redirect(`/login?next=${encodeURIComponent(next)}`);
  return a;
}

/** Page-level guard. The API enforces the same permission independently. */
export async function requirePermission(p: Permission, next = "/"): Promise<AuthContext> {
  const a = await requireAuth(next);
  if (!a.permissions.has(p)) redirect("/forbidden");
  return a;
}

export async function nonce(): Promise<string | undefined> {
  return (await headers()).get("x-nonce") ?? undefined;
}

export async function hasCsrfCookie(): Promise<boolean> {
  return Boolean((await cookies()).get(CSRF_COOKIE())?.value);
}
