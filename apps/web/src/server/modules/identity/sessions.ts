import "server-only";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import type { Role } from "@autocare/contracts";
import { env, isProd } from "../../config/env";
import { getDb, type Tx } from "../../db/client";
import { sessions, userRoles, users } from "../../db/schema";
import { randomToken, sha256Hex } from "../../lib/crypto";
import { isPrivileged, permissionsFor, type Permission } from "./rbac";

/**
 * Revocable server-side sessions (pattern from the Lucia v3 guide).
 *  - token: 256-bit random, only in the cookie / mobile secure store
 *  - id:    SHA-256(token) — a DB leak does not yield usable tokens
 *  - idle timeout (sliding) + absolute timeout; both shorter for privileged roles
 *  - a NEW session is created on every login and privilege change (no fixation)
 */

export const SESSION_COOKIE = () => (isProd() ? "__Host-acq_session" : "acq_session");

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  roles: Role[];
}

export interface AuthContext {
  sessionId: string;
  client: "web" | "mobile";
  user: SessionUser;
  permissions: Set<Permission>;
  mfaVerified: boolean;
  reauthAt: Date | null;
}

function lifetimes(privileged: boolean) {
  const e = env();
  return privileged
    ? { idleMs: e.ADMIN_SESSION_IDLE_MINUTES * 60_000, absMs: e.ADMIN_SESSION_ABSOLUTE_HOURS * 3_600_000 }
    : { idleMs: e.SESSION_IDLE_MINUTES * 60_000, absMs: e.SESSION_ABSOLUTE_HOURS * 3_600_000 };
}

export async function rolesOf(userId: string, tx?: Tx): Promise<Role[]> {
  const db = tx ?? (await getDb());
  const rows = await db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows.map((r) => r.roleId as Role);
}

export async function createSession(
  userId: string,
  opts: { client?: "web" | "mobile"; userAgent?: string | null; ipPrefix?: string | null; mfaVerified?: boolean },
): Promise<{ token: string; sessionId: string; absoluteExpiresAt: Date }> {
  const db = await getDb();
  const roles = await rolesOf(userId);
  const { idleMs, absMs } = lifetimes(isPrivileged(roles));
  const token = randomToken(32);
  const sessionId = sha256Hex(token);
  const now = Date.now();
  const absoluteExpiresAt = new Date(now + absMs);
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    client: opts.client ?? "web",
    userAgent: opts.userAgent?.slice(0, 300) ?? null,
    ipPrefix: opts.ipPrefix ?? null,
    idleExpiresAt: new Date(Math.min(now + idleMs, absoluteExpiresAt.getTime())),
    absoluteExpiresAt,
    mfaVerified: opts.mfaVerified ?? false,
    // Fresh login counts as a recent re-authentication.
    reauthAt: new Date(now),
  });
  return { token, sessionId, absoluteExpiresAt };
}

/** Validate a raw token. Returns null for unknown, revoked, idle- or absolute-expired sessions. */
export async function validateSessionToken(token: string): Promise<AuthContext | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const db = await getDb();
  const sessionId = sha256Hex(token);
  const now = new Date();
  const rows = await db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt), gt(sessions.absoluteExpiresAt, now), gt(sessions.idleExpiresAt, now)))
    .limit(1);
  const row = rows[0];
  if (!row || row.u.status !== "active") return null;

  const roles = await rolesOf(row.u.id);
  const { idleMs } = lifetimes(isPrivileged(roles));
  // Slide the idle window at most once a minute to limit writes.
  if (now.getTime() - row.s.lastSeenAt.getTime() > 60_000) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, idleExpiresAt: new Date(Math.min(now.getTime() + idleMs, row.s.absoluteExpiresAt.getTime())) })
      .where(eq(sessions.id, sessionId));
  }
  return {
    sessionId,
    client: row.s.client,
    mfaVerified: row.s.mfaVerified,
    reauthAt: row.s.reauthAt,
    user: {
      id: row.u.id,
      email: row.u.email,
      displayName: row.u.displayName,
      locale: row.u.locale,
      emailVerified: Boolean(row.u.emailVerifiedAt),
      mfaEnabled: Boolean(row.u.mfaEnabledAt),
      roles,
    },
    permissions: permissionsFor(roles),
  };
}

export async function revokeSession(sessionId: string, reason: string): Promise<void> {
  const db = await getDb();
  await db.update(sessions).set({ revokedAt: new Date(), revokeReason: reason }).where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Revoke all sessions of a user, optionally keeping one (e.g. the current device after password change). */
export async function revokeAllSessions(userId: string, reason: string, exceptSessionId?: string, tx?: Tx): Promise<void> {
  const db = tx ?? (await getDb());
  const where = exceptSessionId
    ? and(eq(sessions.userId, userId), isNull(sessions.revokedAt), ne(sessions.id, exceptSessionId))
    : and(eq(sessions.userId, userId), isNull(sessions.revokedAt));
  await db.update(sessions).set({ revokedAt: new Date(), revokeReason: reason }).where(where);
}

export async function markReauth(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.update(sessions).set({ reauthAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function listSessions(userId: string) {
  const db = await getDb();
  const now = new Date();
  return db
    .select({
      id: sessions.id,
      client: sessions.client,
      userAgent: sessions.userAgent,
      ipPrefix: sessions.ipPrefix,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      absoluteExpiresAt: sessions.absoluteExpiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.absoluteExpiresAt, now), gt(sessions.idleExpiresAt, now)));
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}
