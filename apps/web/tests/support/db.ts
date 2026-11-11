import { NextRequest } from "next/server";
import type { Role } from "@autocare/contracts";
import { resetEnvCache } from "@/server/config/env";
import { MIGRATIONS_DIR, closeDb, getDb } from "@/server/db/client";
import { seedBase } from "@/server/db/seed";
import { userRoles, users } from "@/server/db/schema";
import { resetKeyRing } from "@/server/lib/crypto";
import { resetLimitersForTests } from "@/server/lib/rate-limit";
import { issueCsrfToken } from "@/server/modules/identity/csrf";
import { hashPassword } from "@/server/modules/identity/password";
import { createSession } from "@/server/modules/identity/sessions";
import { resetBreakers } from "@/server/modules/providers/resilience";

async function resetPostgres(url: string) {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new Pool({ connectionString: url, max: 1 });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_DIR });
  await pool.end();
}

export async function freshDb() {
  await closeDb();
  resetEnvCache();
  resetKeyRing();
  resetLimitersForTests();
  resetBreakers();
  if (process.env.TEST_DATABASE_URL) await resetPostgres(process.env.TEST_DATABASE_URL);
  const db = await getDb();
  await seedBase(db);
  return db;
}

let n = 0;
export const PASSWORD = "correct horse battery staple";

export async function makeUser(roles: Role[] = ["vehicle_owner"], opts: { verified?: boolean; mfa?: boolean } = {}) {
  const db = await getDb();
  n++;
  const email = `user${n}-${Date.now()}@example.test`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: await hashPassword(PASSWORD), displayName: `User ${n}`, emailVerifiedAt: opts.verified === false ? null : new Date() })
    .returning();
  for (const r of roles) await db.insert(userRoles).values({ userId: u!.id, roleId: r });
  const s = await createSession(u!.id, { mfaVerified: Boolean(opts.mfa) });
  return { id: u!.id, email, token: s.token, sessionId: s.sessionId, csrf: issueCsrfToken(s.sessionId) };
}

type U = Awaited<ReturnType<typeof makeUser>>;

/** Build a NextRequest as a same-origin browser would send it (cookies + CSRF header). */
export function req(method: string, path: string, opts: { user?: U | null; body?: unknown; headers?: Record<string, string>; csrf?: string | null; origin?: string | null; raw?: Buffer | string } = {}) {
  const headers = new Headers({ "x-forwarded-for": "127.0.0.1", ...(opts.headers ?? {}) });
  const cookies: string[] = [];
  if (opts.user) cookies.push(`acq_session=${opts.user.token}`);
  const csrf = opts.csrf === undefined ? (opts.user ? opts.user.csrf : issueCsrfToken("anon")) : opts.csrf;
  if (csrf) {
    cookies.push(`acq_csrf=${csrf}`);
    headers.set("x-csrf-token", csrf);
  }
  if (cookies.length) headers.set("cookie", cookies.join("; "));
  if (opts.origin !== null) headers.set("origin", opts.origin ?? "http://localhost:3000");
  let body: BodyInit | undefined;
  if (opts.raw !== undefined) body = opts.raw as BodyInit;
  else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  return new NextRequest(new URL(path, "http://localhost:3000"), { method, headers, body });
}

export const params = (p: Record<string, string> = {}) => ({ params: Promise.resolve(p) });

export async function json(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any>, headers: res.headers };
}
