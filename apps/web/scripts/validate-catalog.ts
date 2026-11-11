/**
 * Validates generic catalogue files without touching the database.
 *   npx tsx scripts/validate-catalog.ts src/server/db/seed-data/catalog/p0000-p0299.ts [...more]
 * Checks: generic-range code format, unique codes, known template key,
 * non-empty English title, Arabic title containing Arabic letters, no manufacturer ranges.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { TEMPLATE_KEYS } from "../src/server/db/seed-data/dtc-templates";
import { GENERIC_CODE_RE, type CatalogRow } from "../src/server/db/seed-data/catalog/types";

const SAFETY = new Set(["brakes", "steering", "airbag", "fuel", "high_voltage"]);

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) throw new Error("usage: validate-catalog.ts <file...>");
  const all = new Map<string, string>();
  let problems = 0;
  for (const f of files) {
    const mod = (await import(pathToFileURL(path.resolve(f)).href)) as { ROWS?: CatalogRow[] };
    const rows = mod.ROWS;
    if (!Array.isArray(rows)) {
      console.log(`${f}: missing exported ROWS`);
      problems++;
      continue;
    }
    const bad: string[] = [];
    for (const r of rows) {
      const [code, en, ar, key, safety] = r;
      if (typeof code !== "string" || !GENERIC_CODE_RE.test(code)) bad.push(`${code}: not a generic-range code`);
      if (typeof en !== "string" || en.trim().length < 6) bad.push(`${code}: English title missing`);
      if (typeof ar !== "string" || !/[؀-ۿ]/.test(ar)) bad.push(`${code}: Arabic title missing`);
      if (!TEMPLATE_KEYS.includes(key)) bad.push(`${code}: unknown template "${key}"`);
      if (safety !== undefined && !SAFETY.has(safety)) bad.push(`${code}: bad safety "${safety}"`);
      if (all.has(code)) bad.push(`${code}: duplicate (also in ${all.get(code)})`);
      all.set(code, path.basename(f));
    }
    problems += bad.length;
    console.log(`${path.basename(f)}: ${rows.length} rows, ${bad.length} problems`);
    for (const b of bad.slice(0, 40)) console.log("  - " + b);
  }
  console.log(`TOTAL ${all.size} unique codes, ${problems} problems`);
  process.exit(problems ? 1 : 0);
}

void main();
