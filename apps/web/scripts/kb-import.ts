import "./_env";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { closeDb } from "../src/server/db/client";
import { importManufacturerDtcs, parseCsv } from "../src/server/modules/knowledge/importer";

/**
 * Import LICENSED manufacturer-specific code data.
 *   pnpm kb:import -- --file data.csv --title "Toyota service data export" --version 2026-10 --licence "Contract #123" [--url https://…] [--dry-run]
 * Accepts CSV (header row, see docs/templates/manufacturer-dtc-import.csv) or a JSON array.
 * Refuses unless an admin recorded a licence policy for provider `oem_licensed` (Admin → Providers).
 */
const USAGE = `
Usage / طريقة الاستخدام:
  pnpm kb:import --file <data.csv|data.json> --title "<source title>" --version <version> --licence "<contract ref>" [--url <url>] [--dry-run]

Example / مثال:
  pnpm kb:import --file toyota.csv --title "Toyota service data export" --version 2026-10 --licence "Contract #123" --dry-run

Before importing, record a licence policy for provider "oem_licensed" in Admin -> Providers.
قبل الاستيراد: سجّل ترخيص المزوّد "oem_licensed" من لوحة الإدارة ← المزوّدون.
CSV template / قالب الملف: docs/templates/manufacturer-dtc-import.csv — guide / الدليل: docs/DATA_IMPORT.md
`;

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const file = arg("file");
  const title = arg("title");
  const version = arg("version");
  const licence = arg("licence");
  if (!file || !title || !version || !licence) {
    console.log(USAGE);
    // Asking for help is not an error; a partially filled command is.
    process.exit(process.argv.some((x) => x.startsWith("--")) ? 1 : 0);
  }
  // Paths are relative to the folder the command was run from (pnpm sets INIT_CWD).
  const full = path.resolve(process.env.INIT_CWD ?? process.cwd(), file);
  if (!existsSync(full)) {
    console.log(`
File not found / الملف غير موجود:
  ${full}

"toyota.csv" in the example is only a placeholder. Use the data file you received from your licensed source,
or try the format check with the bundled example (validation only, nothing is saved):
"toyota.csv" في المثال اسم توضيحي فقط. استخدم ملف البيانات الذي حصلت عليه من مصدر مرخّص،
أو جرّب فحص الصيغة بملف المثال المرفق (فحص فقط، لا يُحفظ شيء):

  pnpm kb:import --file docs/templates/manufacturer-dtc-import.example.csv --title "Example" --version test --licence "none" --dry-run
`);
    process.exit(1);
  }
  const text = readFileSync(full, "utf8");
  const rows: unknown[] = full.toLowerCase().endsWith(".json") ? (JSON.parse(text) as unknown[]) : parseCsv(text);
  const r = await importManufacturerDtcs(rows, { sourceTitle: title!, sourceVersion: version!, sourceUrl: arg("url"), licenceRef: licence! }, { dryRun: process.argv.includes("--dry-run") });
  console.log(`${r.dryRun ? "[dry run] valid" : "imported"}: ${r.imported}, duplicates skipped: ${r.skippedDuplicates}, rejected rows: ${r.errors.length}`);
  for (const e of r.errors.slice(0, 50)) console.log(`  line ${e.line}: ${e.error}`);
  await closeDb();
  if (r.dryRun) console.log("[dry run] nothing was saved / لم يُحفظ شيء.");
  if (r.errors.length && !r.imported) process.exit(1);
}

main().catch(async (e) => {
  console.error((e as Error).message);
  await closeDb().catch(() => {});
  process.exit(1);
});
