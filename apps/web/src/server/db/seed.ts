import { and, eq, sql } from "drizzle-orm";
import { seedPlans } from "../modules/billing/service";
import { ROLES, searchKey } from "@autocare/contracts";
import type { Db } from "./client";
import {
  coverageRecords, dataProviders, dtcDefinitions, faultGuides, knowledgeChunks, knowledgeDocuments, licensePolicies, partTerms, permissions,
  rolePermissions, roles, sourceRecords,
} from "./schema";
import { GENERIC_DTCS, PART_TERMS, type SeedDtc } from "./seed-data/generic-dtc";
import { buildFamilyLibrary } from "./seed-data/dtc-families";
import { buildExtendedLibrary } from "./seed-data/dtc-extended";
import { buildCatalogLibrary } from "./seed-data/catalog";
import { FAULT_GUIDES } from "./seed-data/fault-guides";
import { HANDWRITTEN_FIXES } from "./seed-data/handwritten-fixes";
import type { LocalisedItem } from "./schema/knowledge";
import { PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS } from "../modules/identity/rbac";
import { PROVIDERS } from "../modules/providers/adapters";

export const KB_VERSION = "kb-draft-0.1";
export const KB_LIBRARY_VERSION = "kb-library-0.2";
export const KB_CATALOG_VERSION = "kb-catalog-0.3";
const GUIDES_VERSION = "guides-0.1";

async function ensureSource(db: Db, ref: string, title: string): Promise<string> {
  const [existing] = await db.select().from(sourceRecords).where(and(eq(sourceRecords.providerId, "internal_curated"), eq(sourceRecords.externalRef, ref))).limit(1);
  if (existing) return existing.id;
  const [row] = await db.insert(sourceRecords).values({ providerId: "internal_curated", externalRef: ref, title, language: "ar", version: ref, url: "docs/DATA_SOURCES.md" }).returning({ id: sourceRecords.id });
  return row!.id;
}
export const SAMPLE_BRANDS = ["Toyota", "Nissan", "Honda", "Ford", "Chevrolet", "BMW", "Mercedes-Benz", "Volkswagen", "Hyundai", "Kia", "BYD", "Geely", "Chery", "Changan", "MG", "Haval"];
const US_MARKET_BRANDS = new Set(["Toyota", "Nissan", "Honda", "Ford", "Chevrolet", "BMW", "Mercedes-Benz", "Volkswagen", "Hyundai", "Kia"]);

function chunk(text: string, size = 900): string[] {
  const out: string[] = [];
  let cur = "";
  for (const p of text.split(/\n+/)) {
    if ((cur + "\n" + p).length > size && cur) {
      out.push(cur);
      cur = p;
    } else cur = cur ? `${cur}\n${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

/** Idempotent base seed: RBAC, providers, license policies, editorial KB, part terms, coverage placeholders. */
export async function seedBase(db: Db): Promise<void> {
  // RBAC mirror
  for (const r of ROLES) await db.insert(roles).values({ id: r, nameAr: ROLE_LABELS[r].ar, nameEn: ROLE_LABELS[r].en }).onConflictDoNothing();
  for (const [id, description] of Object.entries(PERMISSIONS)) await db.insert(permissions).values({ id, description }).onConflictDoNothing();
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) for (const p of perms) await db.insert(rolePermissions).values({ roleId: role, permissionId: p }).onConflictDoNothing();

  // Providers
  for (const p of Object.values(PROVIDERS)) {
    await db
      .insert(dataProviders)
      .values({ id: p.id, name: p.name, capabilities: p.capabilities, docsUrl: p.docsUrl, status: p.id === "internal_curated" ? "active" : "not_configured", statusNote: p.docsNote, lastCheckedAt: new Date("2026-10-02T00:00:00Z") })
      .onConflictDoNothing();
  }

  const existingInternal = await db.select().from(licensePolicies).where(eq(licensePolicies.providerId, "internal_curated")).limit(1);
  if (!existingInternal.length) {
    await db.insert(licensePolicies).values({
      providerId: "internal_curated", version: "own-content-1", allowDisplay: true, allowCache: true, cacheTtlSeconds: 0, allowTranslation: true, allowOffline: true,
      allowEmbeddings: true, allowTraining: true, allowRedistribution: false, validFrom: new Date("2026-01-01T00:00:00Z"),
      agreementRef: "Project-authored content", notes: "Editorial drafts; technician review pending.",
    });
  }
  const existingVpic = await db.select().from(licensePolicies).where(eq(licensePolicies.providerId, "nhtsa_vpic")).limit(1);
  if (!existingVpic.length) {
    await db.insert(licensePolicies).values({
      providerId: "nhtsa_vpic", version: "public-api-2026-10", allowDisplay: true, allowCache: true, cacheTtlSeconds: 0, allowTranslation: false, allowOffline: false,
      allowEmbeddings: false, allowTraining: false, allowRedistribution: false, validFrom: new Date("2026-10-02T00:00:00Z"),
      agreementRef: "https://vpic.nhtsa.dot.gov/api/ (public, free; no explicit licence text found on 2026-10-02)",
      notes: "Decode results are stored only on the user's own vehicle after confirmation. Not used for RAG/training until terms are confirmed.",
    });
  }

  const existingRecalls = await db.select().from(licensePolicies).where(eq(licensePolicies.providerId, "nhtsa_recalls")).limit(1);
  if (!existingRecalls.length) {
    await db.insert(licensePolicies).values({
      providerId: "nhtsa_recalls", version: "public-api-2026-10", allowDisplay: true, allowCache: true, cacheTtlSeconds: 21_600, allowTranslation: false, allowOffline: false,
      allowEmbeddings: false, allowTraining: false, allowRedistribution: false, validFrom: new Date("2026-10-02T00:00:00Z"),
      agreementRef: "https://www.nhtsa.gov/nhtsa-datasets-and-apis (public, free; no explicit licence text found on 2026-10-02)",
      notes: "Shown verbatim (English) with a US-market caveat; cached in memory for 6 hours; never embedded or used for training.",
    });
  }

  await seedPlans(db);

  // Editorial knowledge base
  let [kbSource] = await db.select().from(sourceRecords).where(and(eq(sourceRecords.providerId, "internal_curated"), eq(sourceRecords.externalRef, KB_VERSION))).limit(1);
  if (!kbSource) {
    [kbSource] = await db
      .insert(sourceRecords)
      .values({ providerId: "internal_curated", externalRef: KB_VERSION, title: "AutoCare editorial DTC drafts (unreviewed)", language: "ar", version: KB_VERSION, url: "docs/DATA_SOURCES.md" })
      .returning();
  }
  // Batched: definitions, then their RAG documents and chunks (idempotent via dtc_def_uq).
  const insertDefs = async (defs: Array<SeedDtc & { fixes?: LocalisedItem[] }>, sourceId: string, version: string) => {
    for (let i = 0; i < defs.length; i += 250) {
      const batch = defs.slice(i, i + 250);
      const inserted = await db
        .insert(dtcDefinitions)
        .values(
          batch.map((d) => {
            const fixes = d.fixes ?? HANDWRITTEN_FIXES[d.code] ?? [];
            const searchText = searchKey([d.code, d.titleAr, d.titleEn, ...d.symptoms.flatMap((x) => [x.ar, x.en]), ...d.causes.flatMap((x) => [x.ar, x.en])].join(" "));
            return {
              code: d.code, rawFormat: d.code, format: "sae_j2012" as const, scope: "generic" as const, make: null, module: null, system: d.system,
              titleAr: d.titleAr, titleEn: d.titleEn, meaningAr: d.meaningAr, meaningEn: d.meaningEn, symptoms: d.symptoms, causes: d.causes, checks: d.checks, fixes,
              skillLevel: d.skillLevel, safetyArea: d.safetyArea ?? ("none" as const), baseUrgency: d.baseUrgency, sourceRecordId: sourceId, version, reviewStatus: "draft" as const, searchText,
            };
          }),
        )
        .onConflictDoNothing()
        .returning({ id: dtcDefinitions.id, code: dtcDefinitions.code });
      const fresh = new Set(inserted.map((r) => r.code));
      const docs = batch.filter((d) => fresh.has(d.code)).map((d) => {
        const fixes = d.fixes ?? HANDWRITTEN_FIXES[d.code] ?? [];
        const body = [
          `${d.code}: ${d.titleEn} — ${d.titleAr}`,
          d.meaningAr,
          d.meaningEn,
          `الأعراض / Symptoms: ${d.symptoms.map((x) => `${x.ar} (${x.en})`).join("؛ ")}`,
          `الأسباب المحتملة / Possible causes: ${d.causes.map((x) => `${x.ar} (${x.en})`).join("؛ ")}`,
          `الفحوص / Checks: ${d.checks.map((x) => `[${x.where}] ${x.ar}`).join(" | ")}`,
          fixes.length ? `الإصلاحات بعد تأكيد السبب / Fixes once confirmed: ${fixes.map((x) => x.ar).join("؛ ")}` : "",
          "Status: editorial draft, not yet reviewed by a technician.",
        ].filter(Boolean).join("\n");
        return { d, body };
      });
      if (!docs.length) continue;
      const docRows = await db
        .insert(knowledgeDocuments)
        .values(docs.map(({ d, body }) => ({ sourceRecordId: sourceId, kind: "dtc_reference" as const, title: `${d.code} ${d.titleEn}`, language: "ar", body, system: d.system, codes: [d.code], ragAllowed: true })))
        .returning({ id: knowledgeDocuments.id });
      const chunkRows = docRows.flatMap((doc, k) => chunk(docs[k]!.body).map((content, j) => ({ documentId: doc.id, chunkIndex: j, content, contentKey: searchKey(content) })));
      for (let j = 0; j < chunkRows.length; j += 500) await db.insert(knowledgeChunks).values(chunkRows.slice(j, j + 500));
    }
  };
  await insertDefs(GENERIC_DTCS, kbSource!.id, KB_VERSION);
  // Backfill fixes on rows created before the fixes column existed.
  for (const [code, fixes] of Object.entries(HANDWRITTEN_FIXES)) {
    await db.update(dtcDefinitions).set({ fixes }).where(and(eq(dtcDefinitions.code, code), eq(dtcDefinitions.version, KB_VERSION), sql`jsonb_array_length(${dtcDefinitions.fixes}) = 0`));
  }

  const source2 = await ensureSource(db, KB_LIBRARY_VERSION, "AutoCare generic code library (family templates, unreviewed)");
  const family = buildFamilyLibrary(new Set(GENERIC_DTCS.map((d) => d.code)));
  await insertDefs(family, source2, KB_LIBRARY_VERSION);
  const extended = buildExtendedLibrary(new Set([...GENERIC_DTCS.map((d) => d.code), ...family.map((d) => d.code)]));
  await insertDefs(extended, source2, KB_LIBRARY_VERSION);
  // Full generic catalogue (title-level rows + subsystem templates); never overrides richer entries above.
  const source4 = await ensureSource(db, KB_CATALOG_VERSION, "AutoCare generic SAE J2012 catalogue (subsystem templates, unreviewed)");
  await insertDefs(buildCatalogLibrary(new Set([...GENERIC_DTCS, ...family, ...extended].map((d) => d.code))), source4, KB_CATALOG_VERSION);

  const source3 = await ensureSource(db, GUIDES_VERSION, "AutoCare fault & warning-light guides (unreviewed)");
  for (const gd of FAULT_GUIDES) {
    const searchText = searchKey([gd.titleAr, gd.titleEn, gd.summaryAr, ...gd.keywords, ...gd.symptoms.flatMap((x) => [x.ar, x.en]), ...gd.causes.flatMap((x) => [x.ar, x.en]), ...gd.relatedCodes].join(" "));
    const [row] = await db
      .insert(faultGuides)
      .values({ slug: gd.slug, category: gd.category, titleAr: gd.titleAr, titleEn: gd.titleEn, summaryAr: gd.summaryAr, summaryEn: gd.summaryEn, symptoms: gd.symptoms, causes: gd.causes, checks: gd.checks, fixes: gd.fixes, safetyArea: gd.safetyArea ?? "none", urgency: gd.urgency, relatedCodes: gd.relatedCodes, sourceRecordId: source3, version: GUIDES_VERSION, searchText })
      .onConflictDoNothing()
      .returning({ id: faultGuides.id });
    if (!row) continue;
    const body = [`${gd.titleAr} — ${gd.titleEn}`, gd.summaryAr, `الأسباب: ${gd.causes.map((x) => x.ar).join("؛ ")}`, `الفحوص: ${gd.checks.map((x) => x.ar).join(" | ")}`, `الإصلاح: ${gd.fixes.map((x) => x.ar).join("؛ ")}`, gd.relatedCodes.length ? `أكواد مرتبطة: ${gd.relatedCodes.join(", ")}` : ""].filter(Boolean).join("\n");
    const [doc] = await db
      .insert(knowledgeDocuments)
      .values({ sourceRecordId: source3, kind: gd.safetyArea ? "safety_guidance" : "general", title: gd.titleEn, language: "ar", body, codes: gd.relatedCodes, ragAllowed: true })
      .returning({ id: knowledgeDocuments.id });
    await db.insert(knowledgeChunks).values(chunk(body).map((content, i) => ({ documentId: doc!.id, chunkIndex: i, content, contentKey: searchKey(content) })));
  }

  const termsExisting = await db.select({ id: partTerms.id }).from(partTerms).limit(1);
  if (!termsExisting.length) {
    await db.insert(partTerms).values(PART_TERMS.map((t) => ({ localTerm: t.local, localKey: searchKey(t.local), technicalAr: t.ar, technicalEn: t.en, category: t.category })));
  }

  // Coverage matrix placeholders — nothing is marked covered without evidence.
  const covExisting = await db.select({ id: coverageRecords.id }).from(coverageRecords).limit(1);
  if (!covExisting.length) {
    const rows: Array<typeof coverageRecords.$inferInsert> = [];
    for (const make of SAMPLE_BRANDS) {
      rows.push({
        providerId: "nhtsa_vpic", make, system: "vin_decode",
        status: US_MARKET_BRANDS.has(make) ? "claimed_by_provider" : "unknown",
        evidenceNote: US_MARKET_BRANDS.has(make)
          ? "vPIC FAQ states high decode confidence for 1995+ vehicles of major manufacturers in the US market. Iraqi/GCC-spec VINs not sample-checked."
          : "Brand not generally sold in the US market; vPIC coverage not expected and not checked.",
      });
      rows.push({ providerId: "internal_curated", make, system: "dtc_generic", status: "pending_check", evidenceNote: `Generic SAE J2012 draft library (editorial, unreviewed); applicability to this brand's Iraqi-market models not verified (OBD-II/EOBD compliance varies by market).` });
      rows.push({ providerId: "internal_curated", make, system: "dtc_manufacturer", status: "not_covered", evidenceNote: "No licensed manufacturer-specific source connected." });
      for (const p of ["autodata", "tecrmi"] as const) rows.push({ providerId: p, make, system: "repair_procedures", status: "unknown", evidenceNote: "Provider not contracted; coverage unknown." });
      rows.push({ providerId: "tecalliance_cn", make, system: "fitment", status: "unknown", evidenceNote: "Provider not contracted; coverage unknown." });
    }
    await db.insert(coverageRecords).values(rows);
  }
}
