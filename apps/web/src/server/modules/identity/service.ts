import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { createTOTPKeyURI, verifyTOTPWithGracePeriod } from "@oslojs/otp";
import QRCode from "qrcode";
import { randomBytes } from "node:crypto";
import type { Role } from "@autocare/contracts";
import { env, isProd } from "../../config/env";
import { getDb } from "../../db/client";
import { outbox, userRoles, userTokens, users } from "../../db/schema";
import { decryptField, encryptField, randomToken, sha256Hex } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { rateLimit, rateLimitReset } from "../../lib/rate-limit";
import { audit } from "../audit/audit";
import { dummyHash, hashPassword, isTooCommon, needsRehash, verifyPassword } from "./password";
import { createSession, markReauth, revokeAllSessions, revokeSession, rolesOf } from "./sessions";

const VERIFY_TTL_MS = 24 * 3_600_000;
const RESET_TTL_MS = 30 * 60_000;
const TOTP_PERIOD = 30;

interface Meta {
  requestId?: string;
  ipPrefix?: string | null;
  userAgent?: string | null;
  ip: string;
}

async function queueEmail(userId: string, template: string, payload: Record<string, string>) {
  const db = await getDb();
  await db.insert(outbox).values({
    channel: "email",
    toUserId: userId,
    template,
    payloadEnc: encryptField(JSON.stringify(payload), "outbox"),
    // No e-mail provider is integrated yet: messages are recorded, not sent.
    status: env().EMAIL_PROVIDER === "none" ? "not_configured" : "queued",
  });
}

async function issueToken(userId: string, purpose: "email_verify" | "password_reset", ttlMs: number) {
  const db = await getDb();
  // Invalidate earlier unused tokens for the same purpose.
  await db
    .update(userTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(userTokens.userId, userId), eq(userTokens.purpose, purpose), isNull(userTokens.usedAt)));
  const token = randomToken(32);
  await db.insert(userTokens).values({ userId, purpose, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

/** Consume a one-time token atomically (single UPDATE ... RETURNING). */
async function consumeToken(token: string, purpose: "email_verify" | "password_reset"): Promise<string | null> {
  const db = await getDb();
  const rows = await db
    .update(userTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(userTokens.tokenHash, sha256Hex(token)), eq(userTokens.purpose, purpose), isNull(userTokens.usedAt), gt(userTokens.expiresAt, new Date())))
    .returning({ userId: userTokens.userId });
  return rows[0]?.userId ?? null;
}

export async function register(
  input: { email: string; password: string; displayName: string; locale: "ar" | "en"; termsVersion: string },
  meta: Meta,
): Promise<{ status: "check_email" }> {
  await rateLimit("register:ip", meta.ip);
  if (isTooCommon(input.password)) throw new AppError("validation_failed", "password_too_common", { fields: { password: ["too_common"] } });
  const db = await getDb();
  const existing = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email}`).limit(1);
  if (existing[0]) {
    // Same response as a new registration; the owner is told by e-mail instead.
    await queueEmail(existing[0].id, "account_exists", { email: input.email });
    return { status: "check_email" };
  }
  const passwordHash = await hashPassword(input.password);
  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      locale: input.locale,
      termsVersion: input.termsVersion,
      termsAcceptedAt: new Date(),
      passwordChangedAt: new Date(),
    })
    .returning({ id: users.id });
  await db.insert(userRoles).values({ userId: user!.id, roleId: "vehicle_owner" });
  const token = await issueToken(user!.id, "email_verify", VERIFY_TTL_MS);
  await queueEmail(user!.id, "verify_email", { link: `${env().APP_ORIGIN}/verify-email?token=${token}` });
  await audit({ action: "auth.register", actorUserId: user!.id, targetKind: "user", targetId: user!.id, requestId: meta.requestId, ipPrefix: meta.ipPrefix });
  return { status: "check_email" };
}

export async function verifyEmail(token: string, meta: Meta) {
  await rateLimit("verify:ip", meta.ip);
  const userId = await consumeToken(token, "email_verify");
  if (!userId) throw new AppError("bad_request", "token_invalid_or_expired");
  const db = await getDb();
  await db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
  await audit({ action: "auth.email_verified", actorUserId: userId, targetKind: "user", targetId: userId, requestId: meta.requestId });
}

export type LoginResult =
  | { status: "ok"; token: string; absoluteExpiresAt: Date; sessionId: string; userId: string }
  | { status: "mfa_required" };

export async function login(
  input: { email: string; password: string; totp?: string },
  meta: Meta & { previousSessionId?: string; client?: "web" | "mobile" },
): Promise<LoginResult> {
  await rateLimit("login:ip", meta.ip);
  await rateLimit("login:account", input.email);
  const db = await getDb();
  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${input.email}`).limit(1);
  const ok = user && user.status === "active" ? await verifyPassword(user.passwordHash, input.password) : (await verifyPassword(await dummyHash(), input.password), false);
  if (!user || !ok) {
    await audit({ action: "auth.login_failed", actorUserId: user?.id ?? null, requestId: meta.requestId, ipPrefix: meta.ipPrefix });
    throw new AppError("unauthenticated", "invalid_credentials");
  }
  let mfaVerified = false;
  if (user.mfaEnabledAt && user.mfaSecretEnc) {
    if (!input.totp) return { status: "mfa_required" };
    await rateLimit("mfa:user", user.id);
    const key = Buffer.from(decryptField(user.mfaSecretEnc, `mfa:${user.id}`), "base64");
    if (!verifyTOTPWithGracePeriod(key, TOTP_PERIOD, 6, input.totp, TOTP_PERIOD)) {
      await audit({ action: "auth.login_failed", actorUserId: user.id, requestId: meta.requestId, ipPrefix: meta.ipPrefix, meta: { reason: "totp" } });
      throw new AppError("unauthenticated", "invalid_credentials");
    }
    mfaVerified = true;
  }
  await rateLimitReset("login:account", input.email);
  if (needsRehash(user.passwordHash)) {
    await db.update(users).set({ passwordHash: await hashPassword(input.password) }).where(eq(users.id, user.id));
  }
  // Never reuse a pre-login session identifier.
  if (meta.previousSessionId) await revokeSession(meta.previousSessionId, "replaced_by_login");
  const s = await createSession(user.id, { client: meta.client, userAgent: meta.userAgent, ipPrefix: meta.ipPrefix, mfaVerified });
  await audit({ action: "auth.login", actorUserId: user.id, targetKind: "session", requestId: meta.requestId, ipPrefix: meta.ipPrefix, meta: { client: meta.client ?? "web", mfa: mfaVerified } });
  return { status: "ok", token: s.token, absoluteExpiresAt: s.absoluteExpiresAt, sessionId: s.sessionId, userId: user.id };
}

export async function logout(sessionId: string, userId: string, meta: Meta) {
  await revokeSession(sessionId, "logout");
  await audit({ action: "auth.logout", actorUserId: userId, requestId: meta.requestId });
}

export async function requestPasswordReset(email: string, meta: Meta): Promise<void> {
  await rateLimit("reset:ip", meta.ip);
  await rateLimit("reset:account", email);
  const db = await getDb();
  const [user] = await db.select({ id: users.id, status: users.status }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  if (user && user.status === "active") {
    const token = await issueToken(user.id, "password_reset", RESET_TTL_MS);
    await queueEmail(user.id, "password_reset", { link: `${env().APP_ORIGIN}/reset-password?token=${token}` });
    await audit({ action: "auth.password_reset_requested", actorUserId: user.id, requestId: meta.requestId, ipPrefix: meta.ipPrefix });
  }
  // Identical outcome whether or not the account exists.
}

export async function resetPassword(token: string, password: string, meta: Meta): Promise<void> {
  await rateLimit("reset:ip", meta.ip);
  if (isTooCommon(password)) throw new AppError("validation_failed", "password_too_common", { fields: { password: ["too_common"] } });
  const userId = await consumeToken(token, "password_reset");
  if (!userId) throw new AppError("bad_request", "token_invalid_or_expired");
  const db = await getDb();
  await db.update(users).set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
  await revokeAllSessions(userId, "password_reset");
  await audit({ action: "auth.password_reset", actorUserId: userId, requestId: meta.requestId, ipPrefix: meta.ipPrefix });
}

export async function changePassword(userId: string, sessionId: string, current: string, next: string, meta: Meta) {
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !(await verifyPassword(user.passwordHash, current))) throw new AppError("unauthenticated", "invalid_credentials");
  if (isTooCommon(next)) throw new AppError("validation_failed", "password_too_common", { fields: { newPassword: ["too_common"] } });
  await db.update(users).set({ passwordHash: await hashPassword(next), passwordChangedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
  // All sessions, including this one, are revoked; the caller issues a fresh session.
  await revokeAllSessions(userId, "password_changed");
  await audit({ action: "auth.password_changed", actorUserId: userId, requestId: meta.requestId, ipPrefix: meta.ipPrefix });
  return createSession(userId, { userAgent: meta.userAgent, ipPrefix: meta.ipPrefix, mfaVerified: Boolean(user.mfaEnabledAt) });
}

export async function reauthenticate(userId: string, sessionId: string, password: string, totp: string | undefined, meta: Meta) {
  await rateLimit("login:account", `reauth:${userId}`);
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !(await verifyPassword(user.passwordHash, password))) throw new AppError("unauthenticated", "invalid_credentials");
  if (user.mfaEnabledAt && user.mfaSecretEnc) {
    const key = Buffer.from(decryptField(user.mfaSecretEnc, `mfa:${user.id}`), "base64");
    if (!totp || !verifyTOTPWithGracePeriod(key, TOTP_PERIOD, 6, totp, TOTP_PERIOD)) throw new AppError("unauthenticated", "invalid_credentials");
  }
  await markReauth(sessionId);
  await audit({ action: "auth.reauth", actorUserId: userId, requestId: meta.requestId });
}

export async function startMfaEnrollment(userId: string, email: string) {
  const db = await getDb();
  const secret = randomBytes(20);
  await db.update(users).set({ mfaSecretEnc: encryptField(secret.toString("base64"), `mfa:${userId}`) }).where(and(eq(users.id, userId), isNull(users.mfaEnabledAt)));
  const uri = createTOTPKeyURI("AutoCare IQ", email, secret, TOTP_PERIOD, 6);
  const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { otpauthUri: uri, qrSvg };
}

export async function confirmMfa(userId: string, oldSessionId: string, totp: string, meta: Meta) {
  await rateLimit("mfa:user", userId);
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.mfaSecretEnc || user.mfaEnabledAt) throw new AppError("bad_request", "no_pending_enrollment");
  const key = Buffer.from(decryptField(user.mfaSecretEnc, `mfa:${userId}`), "base64");
  if (!verifyTOTPWithGracePeriod(key, TOTP_PERIOD, 6, totp, TOTP_PERIOD)) throw new AppError("validation_failed", "totp_invalid", { fields: { totp: ["invalid"] } });
  await db.update(users).set({ mfaEnabledAt: new Date() }).where(eq(users.id, userId));
  await audit({ action: "auth.mfa_enabled", actorUserId: userId, requestId: meta.requestId });
  // Privilege level changed (now MFA-verified): rotate the session id.
  await revokeSession(oldSessionId, "rotated_after_mfa");
  return createSession(userId, { userAgent: meta.userAgent, ipPrefix: meta.ipPrefix, mfaVerified: true });
}

export async function disableMfa(userId: string, meta: Meta) {
  const roles = await rolesOf(userId);
  if (roles.some((r) => ["technical_reviewer", "moderator", "sysadmin"].includes(r))) {
    throw new AppError("forbidden", "mfa_mandatory_for_role");
  }
  const db = await getDb();
  await db.update(users).set({ mfaEnabledAt: null, mfaSecretEnc: null }).where(eq(users.id, userId));
  await audit({ action: "auth.mfa_disabled", actorUserId: userId, requestId: meta.requestId });
}

/** Grant/revoke a role. Revokes the target's sessions so new privileges need a fresh login. */
export async function changeRole(actorId: string, targetUserId: string, role: Role, action: "grant" | "revoke", reason: string, meta: Meta) {
  if (actorId === targetUserId && role === "sysadmin" && action === "revoke") throw new AppError("bad_request", "cannot_revoke_own_admin");
  const db = await getDb();
  await db.transaction(async (tx) => {
    if (action === "grant") {
      await tx.insert(userRoles).values({ userId: targetUserId, roleId: role, grantedBy: actorId }).onConflictDoNothing();
    } else {
      await tx.delete(userRoles).where(and(eq(userRoles.userId, targetUserId), eq(userRoles.roleId, role)));
    }
    await revokeAllSessions(targetUserId, `role_${action}`, undefined, tx);
    await audit(
      { action: action === "grant" ? "rbac.role_granted" : "rbac.role_revoked", actorUserId: actorId, targetKind: "user", targetId: targetUserId, requestId: meta.requestId, ipPrefix: meta.ipPrefix, meta: { role, reason } },
      tx,
    );
  });
}

export const devOutboxEnabled = () => !isProd();
