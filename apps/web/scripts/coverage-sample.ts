import "./_env";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { closeDb, getDb } from "../src/server/db/client";
import { coverageRecords } from "../src/server/db/schema";
import { nhtsaVpic } from "../src/server/modules/providers/adapters";

/**
 * Sample coverage check for VIN decoding. The operator supplies REAL sample
 * VINs (from vehicles they may use) in ops/coverage-samples.csv:
 *   make,model,year,market,vin
 * Each result is recorded as verified_sample / not_covered with evidence for
 * that exact make/model/year only. Nothing is extrapolated or invented.
 */
async function main() {
  const file = path.resolve("../../ops/coverage-samples.csv");
  if (!existsSync(file)) throw new Error("ops/coverage-samples.csv not found");
  const rows = readFileSync(file, "utf8").split(/\r?\n/).slice(1).filter((l) => l.trim() && !l.startsWith("#"));
  if (!rows.length) throw new Error("No sample rows. Add real sample VINs first; this script never invents data.");
  const db = await getDb();
  for (const line of rows) {
    const [make, model, year, market, vin] = line.split(",").map((s) => s.trim());
    if (!make || !vin) continue;
    try {
      const r = await nhtsaVpic.decodeVin(vin, year ? Number(year) : undefined);
      const ok = Boolean(r.make && r.model);
      await db.insert(coverageRecords).values({
        providerId: "nhtsa_vpic", make, model, yearFrom: Number(year) || null, yearTo: Number(year) || null, market, system: "vin_decode",
        status: ok ? "verified_sample" : "not_covered",
        evidenceNote: `sample decode ${new Date().toISOString().slice(0, 10)}: make=${r.make ?? "-"} model=${r.model ?? "-"} warnings=${r.warnings.join("; ") || "none"}`,
        checkedAt: new Date(),
      });
      console.log(`${make} ${model} ${year}: ${ok ? "decoded" : "no data"}`);
    } catch (e) {
      console.log(`${make} ${model} ${year}: provider error ${(e as Error).message}`);
    }
  }
  await closeDb();
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
