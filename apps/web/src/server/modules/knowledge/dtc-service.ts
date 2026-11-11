import "server-only";
import { and, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { parseDtc, searchKey, type ParsedDtc } from "@autocare/contracts";
import { getDb } from "../../db/client";
import { coverageRecords, dataProviders, dtcApplicability, dtcDefinitions, faultGuides, partTerms, sourceRecords } from "../../db/schema";
import { logger } from "../../lib/logger";
import { carsxe, mockTest } from "../providers/adapters";
import { usageAllowed } from "../providers/registry";
import { recordDemand } from "./importer";
import type { ProviderId } from "../providers/types";

type Def = typeof dtcDefinitions.$inferSelect;
type Src = typeof sourceRecords.$inferSelect;

export interface VehicleCtx {
  make: string;
  model?: string | null;
  year?: number | null;
  engine?: string | null;
  market?: string | null;
}

export interface DefinitionView {
  id: string;
  code: string;
  rawFormat: string;
  scope: "generic" | "manufacturer";
  make: string | null;
  module: string | null;
  system: string;
  titleAr: string;
  titleEn: string;
  meaningAr: string;
  meaningEn: string;
  symptoms: Def["symptoms"];
  causes: Def["causes"];
  checks: Def["checks"];
  fixes: Def["fixes"];
  skillLevel: Def["skillLevel"];
  safetyArea: Def["safetyArea"];
  baseUrgency: Def["baseUrgency"];
  reviewStatus: Def["reviewStatus"];
  version: string;
  source: { id: string; provider: string; providerName: string; title: string; version: string | null; fetchedAt: string; url: string | null };
  applicability: Array<{ make: string; model: string | null; yearFrom: number | null; yearTo: number | null; engine: string | null; market: string | null; module: string | null }>;
}

export interface ExternalDescription {
  provider: ProviderId;
  description: string;
  language: string;
  fetchedAt: string;
}

export type LookupStatus =
  /** A definition applying to this vehicle (or a generic code) was found. */
  | "covered"
  /** Manufacturer/module code: definitions exist for this make but none match the vehicle details. */
  | "make_only"
  /** Manufacturer/module code without a vehicle: the user must pick a vehicle first. */
  | "needs_vehicle"
  /** Nothing in our sources. */
  | "not_covered";

export interface DtcLookupResult {
  parsed: ParsedDtc;
  status: LookupStatus;
  definitions: DefinitionView[];
  external: ExternalDescription[];
  conflicts: string[];
  coverage: Array<{ provider: string; system: string; status: string; note: string | null }>;
  /** Plain-language reason shown with not_covered / make_only / needs_vehicle. */
  explanation: "generic_definition" | "manufacturer_definition" | "manufacturer_code_no_vehicle" | "manufacturer_code_vehicle_not_covered" | "manufacturer_code_no_source" | "no_definition";
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function applies(a: typeof dtcApplicability.$inferSelect, v: VehicleCtx): boolean {
  if (norm(a.make) !== norm(v.make)) return false;
  if (a.model && v.model && norm(a.model) !== norm(v.model)) return false;
  if (a.model && !v.model) return false;
  if (v.year != null) {
    if (a.yearFrom != null && v.year < a.yearFrom) return false;
    if (a.yearTo != null && v.year > a.yearTo) return false;
  }
  if (a.engine && v.engine && !norm(v.engine).includes(norm(a.engine))) return false;
  if (a.market && v.market && norm(a.market) !== norm(v.market)) return false;
  return true;
}

async function toViews(defs: Def[]): Promise<DefinitionView[]> {
  if (!defs.length) return [];
  const db = await getDb();
  const srcIds = [...new Set(defs.map((d) => d.sourceRecordId))];
  const srcs = await db
    .select({ s: sourceRecords, providerName: dataProviders.name })
    .from(sourceRecords)
    .innerJoin(dataProviders, eq(dataProviders.id, sourceRecords.providerId))
    .where(inArray(sourceRecords.id, srcIds));
  const srcMap = new Map<string, { s: Src; providerName: string }>(srcs.map((r) => [r.s.id, r]));
  const apps = await db.select().from(dtcApplicability).where(inArray(dtcApplicability.dtcDefinitionId, defs.map((d) => d.id)));
  return defs.flatMap((d) => {
    const src = srcMap.get(d.sourceRecordId);
    if (!src) return [];
    return [
      {
        id: d.id,
        code: d.code,
        rawFormat: d.rawFormat,
        scope: d.scope,
        make: d.make,
        module: d.module,
        system: d.system,
        titleAr: d.titleAr,
        titleEn: d.titleEn,
        meaningAr: d.meaningAr,
        meaningEn: d.meaningEn,
        symptoms: d.symptoms,
        causes: d.causes,
        checks: [...d.checks].sort((a, b) => a.invasiveness - b.invasiveness),
        fixes: d.fixes,
        skillLevel: d.skillLevel,
        safetyArea: d.safetyArea,
        baseUrgency: d.baseUrgency,
        reviewStatus: d.reviewStatus,
        version: d.version,
        source: {
          id: src.s.id,
          provider: src.s.providerId,
          providerName: src.providerName,
          title: src.s.title,
          version: src.s.version,
          fetchedAt: src.s.fetchedAt.toISOString(),
          url: src.s.url,
        },
        applicability: apps
          .filter((a) => a.dtcDefinitionId === d.id)
          .map((a) => ({ make: a.make, model: a.model, yearFrom: a.yearFrom, yearTo: a.yearTo, engine: a.engine, market: a.market, module: a.module })),
      },
    ];
  });
}

/** Definitions whose source is active and not past its licensed cache expiry. */
async function liveDefinitions(code: string): Promise<Def[]> {
  const db = await getDb();
  const now = new Date();
  const rows = await db
    .select({ d: dtcDefinitions })
    .from(dtcDefinitions)
    .innerJoin(sourceRecords, eq(sourceRecords.id, dtcDefinitions.sourceRecordId))
    .where(
      and(
        eq(dtcDefinitions.code, code),
        ne(dtcDefinitions.reviewStatus, "retired"),
        eq(sourceRecords.status, "active"),
        or(isNull(sourceRecords.expiresAt), gt(sourceRecords.expiresAt, now)),
      ),
    );
  return rows.map((r) => r.d);
}

function tokenSet(s: string) {
  return new Set(searchKey(s).split(" ").filter((t) => t.length > 2));
}
function similar(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

async function externalDescriptions(parsed: ParsedDtc): Promise<{ items: ExternalDescription[]; errors: string[] }> {
  const items: ExternalDescription[] = [];
  const errors: string[] = [];
  // Only generic J2012 codes are sent to generic-code providers.
  if (parsed.scope !== "generic") return { items, errors };
  for (const p of [carsxe, mockTest]) {
    if (!(await usageAllowed(p.id, "display"))) continue;
    try {
      const r = await p.lookupDtc(parsed.code);
      if (r) items.push({ provider: p.id, description: r.description, language: r.language, fetchedAt: r.fetchedAt.toISOString() });
    } catch (e) {
      logger.warn({ provider: p.id, err: (e as Error).message }, "dtc provider lookup failed");
      errors.push(p.id);
    }
  }
  return { items, errors };
}

export async function lookupDtc(input: string, vehicle?: VehicleCtx): Promise<DtcLookupResult | null> {
  const parsed = parseDtc(input);
  if (!parsed) return null;
  const all = await liveDefinitions(parsed.code);
  const db = await getDb();

  let chosen: Def[] = [];
  let status: LookupStatus = "not_covered";
  let explanation: DtcLookupResult["explanation"] = "no_definition";

  if (parsed.scope === "generic") {
    chosen = all.filter((d) => d.scope === "generic");
    if (chosen.length) {
      status = "covered";
      explanation = "generic_definition";
    }
    // A make-specific refinement of a generic code is shown too, when it applies.
    if (vehicle) {
      const refinements = all.filter((d) => d.scope === "manufacturer" && norm(d.make) === norm(vehicle.make));
      chosen.push(...refinements);
    }
  } else {
    // Manufacturer / module-specific code: NEVER answered from the generic table.
    const forMake = all.filter((d) => d.scope === "manufacturer");
    if (!vehicle) {
      status = forMake.length ? "needs_vehicle" : "not_covered";
      explanation = forMake.length ? "manufacturer_code_no_vehicle" : "manufacturer_code_no_source";
    } else {
      const sameMake = forMake.filter((d) => norm(d.make) === norm(vehicle.make));
      if (sameMake.length) {
        const apps = await db.select().from(dtcApplicability).where(inArray(dtcApplicability.dtcDefinitionId, sameMake.map((d) => d.id)));
        const matching = sameMake.filter((d) => {
          const own = apps.filter((a) => a.dtcDefinitionId === d.id);
          return own.length === 0 ? false : own.some((a) => applies(a, vehicle));
        });
        if (matching.length) {
          chosen = matching;
          status = "covered";
          explanation = "manufacturer_definition";
        } else {
          status = "make_only";
          explanation = "manufacturer_code_vehicle_not_covered";
        }
      } else {
        explanation = "manufacturer_code_vehicle_not_covered";
      }
    }
  }

  const definitions = await toViews(chosen);
  const ext = await externalDescriptions(parsed);
  const conflicts: string[] = [];
  for (const e of ext.items) {
    for (const d of definitions.filter((x) => x.scope === "generic")) {
      if (similar(e.description, d.titleEn) < 0.34) conflicts.push(`${e.provider}↔${d.source.provider}`);
    }
  }
  if (ext.items.length && status === "not_covered" && parsed.scope === "generic") status = "covered";
  // Anonymous demand signal: which manufacturer codes users need that we cannot answer yet.
  if (parsed.scope !== "generic" && status !== "covered") void recordDemand(parsed.code, vehicle?.make);

  const coverage = vehicle
    ? (
        await db
          .select()
          .from(coverageRecords)
          .where(and(sql`lower(${coverageRecords.make}) = lower(${vehicle.make})`, inArray(coverageRecords.system, parsed.scope === "generic" ? ["dtc_generic"] : ["dtc_manufacturer"])))
          .limit(20)
      ).map((c) => ({ provider: c.providerId, system: c.system, status: c.status, note: c.evidenceNote }))
    : [];

  return {
    parsed,
    status,
    definitions,
    external: ext.items,
    conflicts: [...new Set(conflicts)],
    coverage: [...coverage, ...ext.errors.map((p) => ({ provider: p, system: "dtc_generic", status: "provider_error", note: null }))],
    explanation,
  };
}

export interface TextHit {
  kind: "dtc" | "part_term" | "guide";
  /** Guides only. */
  slug?: string;
  category?: string;
  urgency?: string;
  relatedCodes?: string[];
  id: string;
  code?: string;
  titleAr: string;
  titleEn: string;
  scope?: string;
  make?: string | null;
  reviewStatus?: string;
  matchedTerm?: string;
}

/**
 * Symptom / part-name search over definitions plus the local part-name
 * dictionary (e.g. Iraqi "دينمو" → alternator). Uses Postgres full-text on a
 * normalised search column; all values are bound parameters.
 */
export async function textSearch(q: string, limit = 10): Promise<TextHit[]> {
  const key = searchKey(q);
  if (!key) return [];
  const db = await getDb();
  const terms = await db
    .select()
    .from(partTerms)
    .where(or(eq(partTerms.localKey, key), sql`${partTerms.localKey} like ${"%" + key.replace(/[%_\\]/g, (c) => "\\" + c) + "%"}`))
    .limit(5);
  const expansions = terms.flatMap((t) => [searchKey(t.technicalAr), searchKey(t.technicalEn)]);
  const tokens = [...new Set([key, ...expansions].flatMap((s) => s.split(" ")).filter((t) => t.length > 1))].slice(0, 12);
  let defs: Def[] = [];
  let guides: Array<typeof faultGuides.$inferSelect> = [];
  // Tokens are reduced to letters/digits before building the tsquery, and the
  // query string itself is a bound parameter — never concatenated into SQL.
  const tsq = tokens.map((t) => t.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).map((t) => `${t}:*`).join(" | ");
  if (tsq) {
    defs = (
      await db
        .select({ d: dtcDefinitions, rank: sql<number>`ts_rank(${dtcDefinitions.searchTsv}, to_tsquery('simple', ${tsq}))` })
        .from(dtcDefinitions)
        .where(and(ne(dtcDefinitions.reviewStatus, "retired"), sql`${dtcDefinitions.searchTsv} @@ to_tsquery('simple', ${tsq})`))
        .orderBy(sql`2 desc`, dtcDefinitions.code)
        .limit(limit)
    ).map((r) => r.d);
    guides = (
      await db
        .select({ g: faultGuides, rank: sql<number>`ts_rank(${faultGuides.searchTsv}, to_tsquery('simple', ${tsq}))` })
        .from(faultGuides)
        .where(and(ne(faultGuides.reviewStatus, "retired"), sql`${faultGuides.searchTsv} @@ to_tsquery('simple', ${tsq})`))
        .orderBy(sql`2 desc`, faultGuides.slug)
        .limit(Math.min(5, limit))
    ).map((r) => r.g);
  }
  return [
    ...guides.map((g) => ({ kind: "guide" as const, id: g.id, slug: g.slug, category: g.category, urgency: g.urgency, relatedCodes: g.relatedCodes, titleAr: g.titleAr, titleEn: g.titleEn, reviewStatus: g.reviewStatus })),
    ...terms.map((t) => ({ kind: "part_term" as const, id: t.id, titleAr: t.technicalAr, titleEn: t.technicalEn, matchedTerm: t.localTerm, reviewStatus: t.reviewStatus })),
    ...defs.map((d) => ({ kind: "dtc" as const, id: d.id, code: d.code, titleAr: d.titleAr, titleEn: d.titleEn, scope: d.scope, make: d.make, reviewStatus: d.reviewStatus })),
  ];
}
