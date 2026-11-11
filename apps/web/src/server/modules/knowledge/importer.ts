import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { parseDtc, searchKey } from "@autocare/contracts";
import { getDb } from "../../db/client";
import { dtcApplicability, dtcDefinitions, knowledgeChunks, knowledgeDocuments, sourceRecords } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { audit } from "../audit/audit";
import { currentPolicy } from "../providers/registry";

/**
 * Imports LICENSED manufacturer-specific code data (e.g. an OEM or Autodata
 * export the operator is entitled to use). Refuses unless an admin recorded a
 * licence policy for `oem_licensed` that allows display. Rows are stored as
 * drafts with their applicability (make/model/years/engine/market/module), so the
 * existing coverage-aware lookup only answers for matching vehicles.
 * Text is stored as supplied — no machine translation.
 */

const list = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((v) => (Array.isArray(v) ? v : (v ?? "").split("|")).map((x) => x.trim()).filter(Boolean).slice(0, 15));
const year = z.union([z.number(), z.string()]).optional().transform((v, ctx) => {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1980 || n > 2100) {
    ctx.addIssue({ code: "custom", message: "bad_year" });
    return z.NEVER;
  }
  return n;
});
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

/** Empty CSV cells mean "not supplied". */
const dropEmpty = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "" && x !== null)) : v);

const ImportRowShape = z.object({
  code: z.string().trim().min(3).max(16),
  make: z.string().trim().min(1).max(60),
  model: opt(80),
  yearFrom: year,
  yearTo: year,
  engine: opt(80),
  market: opt(20),
  module: opt(40),
  titleEn: z.string().trim().min(3).max(300),
  titleAr: opt(300),
  meaningEn: z.string().trim().min(3).max(3000),
  meaningAr: opt(3000),
  symptoms: list,
  causes: list,
  fixes: list,
  skillLevel: z.enum(["diy", "intermediate", "workshop", "specialist"]).optional().default("workshop"),
  safetyArea: z.enum(["brakes", "steering", "airbag", "fuel", "high_voltage", "none"]).optional().default("none"),
  baseUrgency: z.enum(["urgent", "soon", "monitor"]).optional().default("soon"),
});
export const ImportRow = z.preprocess(dropEmpty, ImportRowShape);
export type ImportRowInput = z.input<typeof ImportRow>;

export interface ImportMeta {
  sourceTitle: string;
  sourceVersion: string;
  sourceUrl?: string;
  /** Contract / licence reference recorded with the source. */
  licenceRef: string;
}

export interface ImportResult {
  sourceRecordId: string | null;
  imported: number;
  skippedDuplicates: number;
  errors: Array<{ line: number; error: string }>;
  dryRun: boolean;
}

const item = (en: string) => ({ ar: en, en });

export async function importManufacturerDtcs(rows: unknown[], meta: ImportMeta, opts: { dryRun?: boolean; actorUserId?: string } = {}): Promise<ImportResult> {
  if (!meta.licenceRef.trim() || !meta.sourceTitle.trim() || !meta.sourceVersion.trim()) throw new AppError("validation_failed", "import_meta_required");
  // A dry run only validates the file (nothing is stored), so it works before the licence is recorded.
  const policy = opts.dryRun ? null : await currentPolicy("oem_licensed");
  if (!opts.dryRun && (!policy || !policy.allowDisplay)) throw new AppError("forbidden", "no_licence_policy_for_oem_licensed");

  const errors: ImportResult["errors"] = [];
  const valid: Array<{ line: number; row: z.output<typeof ImportRowShape>; code: string; rawFormat: string; format: string; system: string }> = [];
  rows.slice(0, 50_000).forEach((raw, i) => {
    const line = i + 2; // header is line 1 in CSV files
    const r = ImportRow.safeParse(raw);
    if (!r.success) return void errors.push({ line, error: r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ").slice(0, 200) });
    const parsed = parseDtc(r.data.code);
    if (!parsed) return void errors.push({ line, error: "unrecognised code format" });
    if (r.data.yearFrom && r.data.yearTo && r.data.yearFrom > r.data.yearTo) return void errors.push({ line, error: "yearFrom > yearTo" });
    valid.push({ line, row: r.data, code: parsed.code, rawFormat: r.data.code, format: parsed.format, system: parsed.system });
  });
  if (opts.dryRun) return { sourceRecordId: null, imported: valid.length, skippedDuplicates: 0, errors, dryRun: true };

  if (!policy) throw new AppError("forbidden", "no_licence_policy_for_oem_licensed");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const expiresAt = policy.cacheTtlSeconds > 0 ? new Date(Date.now() + policy.cacheTtlSeconds * 1000) : null;
    const [src] = await tx
      .insert(sourceRecords)
      .values({ providerId: "oem_licensed", licensePolicyId: policy.id, externalRef: meta.licenceRef.slice(0, 200), title: meta.sourceTitle.slice(0, 200), url: meta.sourceUrl ?? null, language: "en", version: meta.sourceVersion.slice(0, 60), expiresAt })
      .returning({ id: sourceRecords.id });
    let imported = 0;
    let skipped = 0;
    for (const v of valid) {
      const r = v.row;
      const searchText = searchKey([v.code, r.make, r.model, r.titleEn, r.titleAr, ...r.symptoms, ...r.causes].filter(Boolean).join(" "));
      const [def] = await tx
        .insert(dtcDefinitions)
        .values({
          code: v.code, rawFormat: v.rawFormat, format: v.format as typeof dtcDefinitions.$inferInsert.format, scope: "manufacturer", make: r.make, module: r.module ?? null,
          system: v.system as typeof dtcDefinitions.$inferInsert.system,
          titleEn: r.titleEn, titleAr: r.titleAr ?? r.titleEn, meaningEn: r.meaningEn, meaningAr: r.meaningAr ?? r.meaningEn,
          symptoms: r.symptoms.map(item), causes: r.causes.map(item), checks: [], fixes: r.fixes.map(item),
          skillLevel: r.skillLevel, safetyArea: r.safetyArea, baseUrgency: r.baseUrgency,
          sourceRecordId: src!.id, version: meta.sourceVersion.slice(0, 60), reviewStatus: "draft", searchText,
        })
        .onConflictDoNothing()
        .returning({ id: dtcDefinitions.id });
      if (!def) {
        skipped++;
        continue;
      }
      await tx.insert(dtcApplicability).values({ dtcDefinitionId: def.id, make: r.make, model: r.model ?? null, yearFrom: r.yearFrom ?? null, yearTo: r.yearTo ?? null, engine: r.engine ?? null, market: r.market ?? null, module: r.module ?? null, rawFormat: v.rawFormat, sourceRecordId: src!.id });
      // Retrieval only when the licence explicitly allows embeddings/RAG.
      if (policy.allowEmbeddings) {
        const body = [`${v.code} — ${r.titleEn} (${r.make}${r.model ? ` ${r.model}` : ""})`, r.meaningEn, r.causes.length ? `Causes: ${r.causes.join("; ")}` : ""].filter(Boolean).join("\n");
        const [doc] = await tx.insert(knowledgeDocuments).values({ sourceRecordId: src!.id, kind: "dtc_reference", title: `${v.code} ${r.titleEn}`, language: "en", body, make: r.make, model: r.model ?? null, yearFrom: r.yearFrom ?? null, yearTo: r.yearTo ?? null, system: v.system, codes: [v.code], ragAllowed: true }).returning({ id: knowledgeDocuments.id });
        await tx.insert(knowledgeChunks).values({ documentId: doc!.id, chunkIndex: 0, content: body, contentKey: searchKey(body), tokenEstimate: Math.ceil(body.length / 4) });
      }
      imported++;
    }
    await audit({ action: "knowledge.dtc_changed", actorUserId: opts.actorUserId ?? null, targetKind: "source_record", targetId: src!.id, meta: { import: "oem_licensed", imported, skipped, errors: errors.length } }, tx);
    return { sourceRecordId: src!.id, imported, skippedDuplicates: skipped, errors, dryRun: false };
  });
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). Header row → object keys. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c !== "")) rows.push(row);
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

// ---------------- demand for uncovered manufacturer codes ----------------

/** Fire-and-forget counter; never blocks or fails a lookup. */
export async function recordDemand(code: string, make: string | null | undefined): Promise<void> {
  try {
    const db = await getDb();
    const m = (make ?? "unknown").trim().slice(0, 60) || "unknown";
    await db.execute(sql`insert into dtc_demand (code, make, count, last_at) values (${code}, ${m}, 1, now())
      on conflict (code, make) do update set count = dtc_demand.count + 1, last_at = now()`);
  } catch {
    /* demand stats are best-effort */
  }
}

export async function topDemand(limit = 50): Promise<Array<{ code: string; make: string; count: number; lastAt: Date }>> {
  const db = await getDb();
  const r = await db.execute(sql`select code, make, count, last_at from dtc_demand order by count desc, last_at desc limit ${limit}`);
  const rows = ((r as { rows?: unknown[] }).rows ?? (r as unknown as unknown[])) as Array<{ code: string; make: string; count: number; last_at: string | Date }>;
  return rows.map((x) => ({ code: x.code, make: x.make, count: Number(x.count), lastAt: new Date(x.last_at) }));
}
