import { defineConfig } from "drizzle-kit";

/**
 * Migrations are generated from src/server/db/schema and committed under ./drizzle.
 * Apply them with `pnpm db:migrate` using the MIGRATION account
 * (DATABASE_MIGRATION_URL), not the least-privilege application account.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL ?? "postgres://localhost/autocare" },
  strict: true,
  verbose: true,
});
