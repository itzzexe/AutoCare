import "./_env";
import path from "node:path";

/** Applies committed SQL migrations using the migration account (DATABASE_MIGRATION_URL). */
async function main() {
  const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!url) {
    const { getDb, closeDb } = await import("../src/server/db/client");
    await getDb(); // the embedded PGlite database migrates itself on open
    await closeDb();
    console.log("Embedded PGlite database migrated.");
    return;
  }
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new Pool({ connectionString: url, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });
  // Re-assert least privilege for the application role (append-only audit log etc.).
  const role = await pool.query("select 1 from pg_roles where rolname = 'autocare_app'");
  if (role.rowCount) {
    const { readFileSync } = await import("node:fs");
    await pool.query(readFileSync(path.resolve("../../ops/sql/post-migrate-grants.sql"), "utf8"));
    console.log("Least-privilege grants re-applied for autocare_app.");
  }
  await pool.end();
  console.log("PostgreSQL migrations applied.");
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
