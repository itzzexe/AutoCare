import { generateTOTP } from "@oslojs/otp";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { POST as registerRoute } from "@/app/api/v1/auth/register/route";
import { getDb } from "@/server/db/client";
import { outbox, sessions, userTokens, users } from "@/server/db/schema";
import { decryptField, sha256Hex } from "@/server/lib/crypto";
import { verifyPassword } from "@/server/modules/identity/password";
import * as identity from "@/server/modules/identity/service";
import { validateSessionToken } from "@/server/modules/identity/sessions";
import { PASSWORD, freshDb, json, makeUser, params, req } from "./support/db";

const meta = { ip: "127.0.0.1", requestId: "test" };

beforeAll(async () => {
  await freshDb();
});

describe("registration", () => {
  it("stores an Argon2id hash, never the password, and gives a generic answer for existing emails", async () => {
    const email = "new.owner@example.test";
    const a = await json(await registerRoute(req("POST", "/api/v1/auth/register", { body: { email, password: "a long passphrase here", displayName: "سيارة البيت", locale: "ar", acceptTerms: true, termsVersion: "t1" } }), params()));
    const b = await json(await registerRoute(req("POST", "/api/v1/auth/register", { body: { email, password: "another long phrase", displayName: "X", locale: "ar", acceptTerms: true, termsVersion: "t1" } }), params()));
    expect(a.status).toBe(200);
    expect(b.body).toEqual(a.body);
    const db = await getDb();
    const [u] = await db.select().from(users).where(eq(users.email, email));
    expect(u!.passwordHash.startsWith("$argon2id$v=19$m=19456,t=2,p=1$")).toBe(true);
    expect(u!.passwordHash).not.toContain("a long passphrase");
    expect(u!.displayName).toBe("سيارة البيت");
  });

  it("rejects unknown fields and short passwords", async () => {
    const r = await json(await registerRoute(req("POST", "/api/v1/auth/register", { body: { email: "x@example.test", password: "short", displayName: "x", locale: "ar", acceptTerms: true, termsVersion: "t1", isAdmin: true } }), params()));
    expect(r.status).toBe(422);
    expect(Object.keys(r.body.error.fields)).toEqual(expect.arrayContaining(["password"]));
  });
});

describe("login & sessions", () => {
  it("logs in, sets HttpOnly cookie and a fresh CSRF token; wrong password gives the same error as unknown email", async () => {
    const u = await makeUser();
    const ok = await loginRoute(req("POST", "/api/v1/auth/login", { body: { email: u.email, password: PASSWORD } }), params());
    expect(ok.status).toBe(200);
    const setCookie = ok.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/acq_session=[^;]+;.*HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);

    const wrong = await json(await loginRoute(req("POST", "/api/v1/auth/login", { body: { email: u.email, password: "not the password at all" } }), params()));
    const unknown = await json(await loginRoute(req("POST", "/api/v1/auth/login", { body: { email: "nobody@example.test", password: "not the password at all" } }), params()));
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it("rate-limits repeated attempts on one account with 429 + Retry-After", async () => {
    const u = await makeUser();
    let last: Response | undefined;
    for (let i = 0; i < 8; i++) last = await loginRoute(req("POST", "/api/v1/auth/login", { body: { email: u.email, password: "wrong wrong wrong" } }), params());
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("rejects revoked, idle-expired and absolute-expired sessions", async () => {
    const db = await getDb();
    const a = await makeUser();
    expect(await validateSessionToken(a.token)).not.toBeNull();
    await db.update(sessions).set({ idleExpiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, a.sessionId));
    expect(await validateSessionToken(a.token)).toBeNull();

    const b = await makeUser();
    await db.update(sessions).set({ absoluteExpiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, b.sessionId));
    expect(await validateSessionToken(b.token)).toBeNull();

    const c = await makeUser();
    await identity.logout(c.sessionId, c.id, meta);
    expect(await validateSessionToken(c.token)).toBeNull();
  });

  it("stores only the SHA-256 of the session token", async () => {
    const u = await makeUser();
    const db = await getDb();
    const rows = await db.select().from(sessions).where(eq(sessions.userId, u.id));
    expect(rows[0]!.id).toBe(sha256Hex(u.token));
    expect(JSON.stringify(rows)).not.toContain(u.token);
  });

  it("password change revokes every existing session and issues a new one", async () => {
    const u = await makeUser();
    const s = await identity.changePassword(u.id, u.sessionId, PASSWORD, "a brand new long passphrase", meta);
    expect(await validateSessionToken(u.token)).toBeNull();
    expect(await validateSessionToken(s.token)).not.toBeNull();
  });

  it("role change revokes the target's sessions (fresh login required)", async () => {
    const admin = await makeUser(["vehicle_owner", "sysadmin"], { mfa: true });
    const target = await makeUser();
    await identity.changeRole(admin.id, target.id, "technical_reviewer", "grant", "test", meta);
    expect(await validateSessionToken(target.token)).toBeNull();
  });
});

describe("password reset", () => {
  it("issues a single-use, hashed, expiring token and gives the same answer for unknown accounts", async () => {
    const u = await makeUser();
    const db = await getDb();
    await identity.requestPasswordReset(u.email, meta);
    await identity.requestPasswordReset("ghost@example.test", meta);
    const [mail] = await db.select().from(outbox).where(eq(outbox.toUserId, u.id)).orderBy(outbox.createdAt);
    const link = (JSON.parse(decryptField(mail!.payloadEnc, "outbox")) as { link?: string }).link ?? "";
    const outboxRows = await db.select().from(outbox).where(eq(outbox.template, "password_reset"));
    expect(outboxRows.every((r) => r.toUserId === u.id)).toBe(true);
    const token = new URL(link).searchParams.get("token")!;
    const tokens = await db.select().from(userTokens).where(eq(userTokens.userId, u.id));
    expect(tokens.some((t) => t.tokenHash === sha256Hex(token))).toBe(true);
    expect(JSON.stringify(tokens)).not.toContain(token);

    await identity.resetPassword(token, "fresh new long passphrase", meta);
    await expect(identity.resetPassword(token, "another fresh passphrase", meta)).rejects.toMatchObject({ code: "bad_request" });
    expect(await validateSessionToken(u.token)).toBeNull();
    const [after] = await db.select().from(users).where(eq(users.id, u.id));
    expect(await verifyPassword(after!.passwordHash, "fresh new long passphrase")).toBe(true);
  });

  it("refuses an expired token", async () => {
    const u = await makeUser();
    const db = await getDb();
    await identity.requestPasswordReset(u.email, meta);
    await db.update(userTokens).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(userTokens.userId, u.id));
    const [mail] = await db.select().from(outbox).where(eq(outbox.toUserId, u.id));
    const token = new URL((JSON.parse(decryptField(mail!.payloadEnc, "outbox")) as { link: string }).link).searchParams.get("token")!;
    await expect(identity.resetPassword(token, "fresh new long passphrase", meta)).rejects.toMatchObject({ code: "bad_request" });
  });
});

describe("MFA", () => {
  it("enrols TOTP, rotates the session, then requires the code at login", async () => {
    const u = await makeUser();
    const db = await getDb();
    await identity.startMfaEnrollment(u.id, u.email);
    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    const key = Buffer.from(decryptField(row!.mfaSecretEnc!, `mfa:${u.id}`), "base64");
    const s = await identity.confirmMfa(u.id, u.sessionId, generateTOTP(key, 30, 6), meta);
    expect(await validateSessionToken(u.token)).toBeNull();
    expect((await validateSessionToken(s.token))!.mfaVerified).toBe(true);

    expect((await identity.login({ email: u.email, password: PASSWORD }, meta)).status).toBe("mfa_required");
    await expect(identity.login({ email: u.email, password: PASSWORD, totp: "000000" }, meta)).rejects.toMatchObject({ code: "unauthenticated" });
    expect((await identity.login({ email: u.email, password: PASSWORD, totp: generateTOTP(key, 30, 6) }, meta)).status).toBe("ok");
  });
});
