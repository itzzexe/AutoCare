import "./_env";
import { closeDb, getDb } from "../src/server/db/client";
import { seedBase } from "../src/server/db/seed";

/** Base reference data (safe in every environment; contains no accounts). */
async function main() {
  await seedBase(await getDb());
  await closeDb();
  console.log("Base seed applied: RBAC, providers, licence policies, editorial KB drafts, part terms, coverage placeholders.");
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
