import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, real, text, uniqueIndex, uuid, vector } from "drizzle-orm/pg-core";
import { createdAt, pk, ts, tsvector, updatedAt } from "./common";
import { users } from "./identity";

// ---------------- providers & licensing ----------------

export const dataProviders = pgTable("data_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** What the provider can supply. A provider may have several. */
  capabilities: jsonb("capabilities").$type<Array<"vin_decode" | "dtc_lookup" | "repair_data" | "fitment" | "maintenance_schedule" | "recalls" | "model_catalog">>().notNull(),
  docsUrl: text("docs_url"),
  /** Honest state shown in admin and in user-facing coverage notes. */
  status: text("status", { enum: ["not_configured", "active", "disabled", "license_expired", "test_only"] }).notNull().default("not_configured"),
  statusNote: text("status_note"),
  lastCheckedAt: ts("last_checked_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Usage rights per provider and agreement version. Every permission defaults
 * to false: nothing is cached, translated, embedded or trained on unless the
 * agreement explicitly says so and a person recorded it here.
 */
export const licensePolicies = pgTable("license_policies", {
  id: pk(),
  providerId: text("provider_id").notNull().references(() => dataProviders.id),
  version: text("version").notNull(),
  allowDisplay: boolean("allow_display").notNull().default(false),
  allowCache: boolean("allow_cache").notNull().default(false),
  cacheTtlSeconds: integer("cache_ttl_seconds").notNull().default(0),
  allowTranslation: boolean("allow_translation").notNull().default(false),
  allowOffline: boolean("allow_offline").notNull().default(false),
  allowEmbeddings: boolean("allow_embeddings").notNull().default(false),
  allowTraining: boolean("allow_training").notNull().default(false),
  allowRedistribution: boolean("allow_redistribution").notNull().default(false),
  validFrom: ts("valid_from").notNull(),
  validUntil: ts("valid_until"),
  agreementRef: text("agreement_ref"),
  notes: text("notes"),
  recordedBy: uuid("recorded_by").references(() => users.id),
  createdAt: createdAt(),
});

/** One record per piece of fetched or authored content, with provenance. */
export const sourceRecords = pgTable(
  "source_records",
  {
    id: pk(),
    providerId: text("provider_id").notNull().references(() => dataProviders.id),
    licensePolicyId: uuid("license_policy_id").references(() => licensePolicies.id),
    externalRef: text("external_ref"),
    title: text("title").notNull(),
    url: text("url"),
    language: text("language").notNull().default("en"),
    version: text("version"),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
    /** Cache expiry derived from the license policy. Expired rows are not served. */
    expiresAt: ts("expires_at"),
    status: text("status", { enum: ["active", "disabled", "expired"] }).notNull().default("active"),
    payloadHash: text("payload_hash"),
  },
  (t) => [index("source_records_provider_idx").on(t.providerId, t.externalRef)],
);

export const coverageRecords = pgTable(
  "coverage_records",
  {
    id: pk(),
    providerId: text("provider_id").notNull().references(() => dataProviders.id),
    make: text("make").notNull(),
    model: text("model"),
    yearFrom: integer("year_from"),
    yearTo: integer("year_to"),
    engine: text("engine"),
    market: text("market"),
    system: text("system", { enum: ["vin_decode", "dtc_generic", "dtc_manufacturer", "repair_procedures", "fitment", "maintenance_schedule"] }).notNull(),
    /**
     * unknown            - nothing checked yet (default; never shown as covered)
     * pending_check      - scheduled for a sample check
     * claimed_by_provider- provider documentation claims coverage, not tested by us
     * verified_sample    - a sample request returned usable data (evidence recorded)
     * not_covered        - sample check returned no data
     */
    status: text("status", { enum: ["unknown", "pending_check", "claimed_by_provider", "verified_sample", "not_covered"] }).notNull().default("unknown"),
    evidenceNote: text("evidence_note"),
    checkedAt: ts("checked_at"),
    checkedBy: uuid("checked_by").references(() => users.id),
  },
  (t) => [index("coverage_lookup_idx").on(t.make, t.system)],
);

// ---------------- vehicle reference catalog ----------------

export const vehicleVariants = pgTable(
  "vehicle_variants",
  {
    id: pk(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    yearFrom: integer("year_from").notNull(),
    yearTo: integer("year_to").notNull(),
    engine: text("engine"),
    fuel: text("fuel"),
    market: text("market"),
    sourceRecordId: uuid("source_record_id").references(() => sourceRecords.id),
  },
  (t) => [index("vehicle_variants_mm_idx").on(t.make, t.model)],
);

// ---------------- DTC knowledge (definitions are separate from procedures and fitment) ----------------

export interface LocalisedItem {
  ar: string;
  en: string;
}
export interface CheckStep {
  id: string;
  ar: string;
  en: string;
  /** home = owner can do it safely; workshop = needs tools/lift; specialist = dealer tools or high risk. */
  where: "home" | "workshop" | "specialist";
  tools: string[];
  expectedAr: string;
  expectedEn: string;
  /** Order from least to most invasive; lower first. */
  invasiveness: number;
  /** Optional branch: what to do on pass/fail. */
  onFailAr?: string;
  onFailEn?: string;
}

export const dtcDefinitions = pgTable(
  "dtc_definitions",
  {
    id: pk(),
    code: text("code").notNull(),
    /** Format as published by the source (e.g. "P0420", "2A82", "U0100-87"). */
    rawFormat: text("raw_format").notNull(),
    format: text("format", { enum: ["sae_j2012", "sae_j2012_ftb", "manufacturer_hex", "legacy_numeric"] }).notNull(),
    scope: text("scope", { enum: ["generic", "manufacturer"] }).notNull(),
    /** Required when scope = manufacturer. */
    make: text("make"),
    module: text("module"),
    system: text("system", { enum: ["powertrain", "chassis", "body", "network", "unknown"] }).notNull(),
    titleAr: text("title_ar").notNull(),
    titleEn: text("title_en").notNull(),
    meaningAr: text("meaning_ar").notNull(),
    meaningEn: text("meaning_en").notNull(),
    symptoms: jsonb("symptoms").$type<LocalisedItem[]>().notNull().default([]),
    causes: jsonb("causes").$type<LocalisedItem[]>().notNull().default([]),
    checks: jsonb("checks").$type<CheckStep[]>().notNull().default([]),
    /** Common repairs — only to be applied once the cause is confirmed by the checks. */
    fixes: jsonb("fixes").$type<LocalisedItem[]>().notNull().default([]),
    skillLevel: text("skill_level", { enum: ["diy", "intermediate", "workshop", "specialist"] }).notNull(),
    /** Safety-critical areas trigger referral rules and suppress DIY steps. */
    safetyArea: text("safety_area", { enum: ["brakes", "steering", "airbag", "fuel", "high_voltage", "none"] }).notNull().default("none"),
    /** Reviewed baseline urgency for this code when no other rule fires. */
    baseUrgency: text("base_urgency", { enum: ["urgent", "soon", "monitor"] }).notNull().default("soon"),
    sourceRecordId: uuid("source_record_id").notNull().references(() => sourceRecords.id),
    version: text("version").notNull(),
    reviewStatus: text("review_status", { enum: ["draft", "reviewed", "retired"] }).notNull().default("draft"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: ts("reviewed_at"),
    searchText: text("search_text").notNull().default(""),
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(sql`to_tsvector('simple', search_text)`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("dtc_code_idx").on(t.code),
    index("dtc_tsv_idx").using("gin", t.searchTsv),
    uniqueIndex("dtc_def_uq").on(t.code, t.scope, sql`coalesce(${t.make}, '')`, sql`coalesce(${t.module}, '')`, t.version),
  ],
);

/** Which vehicles a (manufacturer) definition applies to. */
export const dtcApplicability = pgTable(
  "dtc_applicability",
  {
    id: pk(),
    dtcDefinitionId: uuid("dtc_definition_id").notNull().references(() => dtcDefinitions.id, { onDelete: "cascade" }),
    make: text("make").notNull(),
    model: text("model"),
    yearFrom: integer("year_from"),
    yearTo: integer("year_to"),
    engine: text("engine"),
    market: text("market"),
    module: text("module"),
    rawFormat: text("raw_format"),
    sourceRecordId: uuid("source_record_id").notNull().references(() => sourceRecords.id),
    notes: text("notes"),
  },
  (t) => [index("dtc_app_idx").on(t.dtcDefinitionId), index("dtc_app_make_idx").on(t.make, t.model)],
);

/** Local / colloquial part names (Iraqi dialect) mapped to technical terms. Needs field review. */
export const partTerms = pgTable(
  "part_terms",
  {
    id: pk(),
    localTerm: text("local_term").notNull(),
    localKey: text("local_key").notNull(),
    technicalAr: text("technical_ar").notNull(),
    technicalEn: text("technical_en").notNull(),
    category: text("category").notNull(),
    reviewStatus: text("review_status", { enum: ["draft", "reviewed"] }).notNull().default("draft"),
  },
  (t) => [index("part_terms_key_idx").on(t.localKey)],
);

// ---------------- RAG corpus ----------------

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: pk(),
    sourceRecordId: uuid("source_record_id").notNull().references(() => sourceRecords.id),
    kind: text("kind", { enum: ["dtc_reference", "procedure", "verified_case", "safety_guidance", "general"] }).notNull(),
    title: text("title").notNull(),
    language: text("language").notNull(),
    body: text("body").notNull(),
    make: text("make"),
    model: text("model"),
    yearFrom: integer("year_from"),
    yearTo: integer("year_to"),
    system: text("system"),
    codes: jsonb("codes").$type<string[]>().notNull().default([]),
    /** Only set true when the license policy allows embeddings/RAG for the source. */
    ragAllowed: boolean("rag_allowed").notNull().default(false),
    status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [index("kdoc_make_idx").on(t.make, t.system)],
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: pk(),
    documentId: uuid("document_id").notNull().references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    contentKey: text("content_key").notNull(),
    tsv: tsvector("tsv").generatedAlwaysAs(sql`to_tsvector('simple', content_key)`),
    embedding: vector("embedding", { dimensions: 1024 }),
    embeddingModel: text("embedding_model"),
    tokenEstimate: real("token_estimate"),
  },
  (t) => [index("kchunk_doc_idx").on(t.documentId), index("kchunk_tsv_idx").using("gin", t.tsv)],
);

/**
 * Anonymous demand counter for manufacturer codes we could not answer
 * (per code and make). No user ids. Tells the operator which licensed data to buy first.
 */
export const dtcDemand = pgTable(
  "dtc_demand",
  {
    id: pk(),
    code: text("code").notNull(),
    make: text("make").notNull(),
    count: integer("count").notNull().default(1),
    firstAt: createdAt(),
    lastAt: ts("last_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("dtc_demand_uq").on(t.code, t.make), index("dtc_demand_count_idx").on(t.count)],
);

/** Symptom-based fault guides (no code needed) and dashboard warning-light meanings. */
export const faultGuides = pgTable(
  "fault_guides",
  {
    id: pk(),
    slug: text("slug").notNull(),
    category: text("category").notNull(),
    titleAr: text("title_ar").notNull(),
    titleEn: text("title_en").notNull(),
    summaryAr: text("summary_ar").notNull(),
    summaryEn: text("summary_en").notNull(),
    symptoms: jsonb("symptoms").$type<LocalisedItem[]>().notNull().default([]),
    causes: jsonb("causes").$type<LocalisedItem[]>().notNull().default([]),
    checks: jsonb("checks").$type<CheckStep[]>().notNull().default([]),
    fixes: jsonb("fixes").$type<LocalisedItem[]>().notNull().default([]),
    safetyArea: text("safety_area", { enum: ["brakes", "steering", "airbag", "fuel", "high_voltage", "none"] }).notNull().default("none"),
    urgency: text("urgency", { enum: ["stop_driving", "urgent", "soon", "monitor"] }).notNull(),
    relatedCodes: jsonb("related_codes").$type<string[]>().notNull().default([]),
    sourceRecordId: uuid("source_record_id").notNull().references(() => sourceRecords.id),
    version: text("version").notNull(),
    reviewStatus: text("review_status", { enum: ["draft", "reviewed", "retired"] }).notNull().default("draft"),
    searchText: text("search_text").notNull().default(""),
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(sql`to_tsvector('simple', search_text)`),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("fault_guides_slug_uq").on(t.slug), index("fault_guides_tsv_idx").using("gin", t.searchTsv), index("fault_guides_cat_idx").on(t.category)],
);
