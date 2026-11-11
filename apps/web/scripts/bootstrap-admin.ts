import "./_env";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db/client";
import { userRoles, users } from "../src/server/db/schema";
import { audit } from "../src/server/modules/audit/audit";
import { hashPassword } from "../src/server/modules/identity/password";

/**
 * Explicit, one-off creation of the first system administrator:
 *   pnpm admin:bootstrap --email admin@example.org
 * A random password is printed ONCE. There is no default or well-known admin.
 * MFA enrolment is mandatory before any admin permission can be used.
 */
async function main() {
  const i = process.argv.indexOf("--email");
  const email = i > 0 ? process.argv[i + 1]?.toLowerCase() : undefined;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Usage: pnpm admin:bootstrap --email you@example.org");
  const db = await getDb();
  const admins = await db.select({ id: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, "sysadmin")).limit(1);
  if (admins.length && !process.argv.includes("--additional")) throw new Error("A sysadmin already exists. Use --additional to create another (audited).");
  const password = randomBytes(18).toString("base64url");
  const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  let userId = existing?.id;
  if (!userId) {
    const [u] = await db
      .insert(users)
      .values({ email, passwordHash: await hashPassword(password), displayName: "System administrator", emailVerifiedAt: new Date(), passwordChangedAt: new Date() })
      .returning({ id: users.id });
    userId = u!.id;
    await db.insert(userRoles).values({ userId, roleId: "vehicle_owner" }).onConflictDoNothing();
  }
  await db.insert(userRoles).values({ userId, roleId: "sysadmin" }).onConflictDoNothing();
  await audit({ action: "rbac.role_granted", actorUserId: null, targetKind: "user", targetId: userId, meta: { role: "sysadmin", via: "bootstrap_cli" } });
  await closeDb();
  console.log(`sysadmin ready: ${email}`);
  if (!existing) console.log(`one-time password (shown once — change it after first login): ${password}`);
  console.log("Enrol MFA (Account → Security) before admin pages unlock.");
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
