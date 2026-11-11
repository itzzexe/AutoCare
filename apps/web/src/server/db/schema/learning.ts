import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, pk, ts, updatedAt } from "./common";
import { diagnosticSessions, vehicles } from "./diagnostics";
import { users } from "./identity";

/** The user's own repair record. Private to the user; never used for learning directly. */
export const repairCases = pgTable(
  "repair_cases",
  {
    id: pk(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    diagnosticSessionId: uuid("diagnostic_session_id").references(() => diagnosticSessions.id, { onDelete: "set null" }),
    /** Vehicle spec snapshot without VIN/plate (make/model/year/engine/fuel/market). */
    vehicleSnapshot: jsonb("vehicle_snapshot").$type<Record<string, unknown>>().notNull(),
    codes: jsonb("codes").$type<string[]>().notNull().default([]),
    symptoms: text("symptoms").notNull().default(""),
    measurements: jsonb("measurements").$type<Array<{ name: string; value: string; unit?: string }>>().notNull().default([]),
    confirmedCause: text("confirmed_cause"),
    confirmedBy: text("confirmed_by", { enum: ["owner", "mechanic", "dealer", "unknown"] }).notNull().default("unknown"),
    repairPerformed: text("repair_performed"),
    partsReplaced: jsonb("parts_replaced").$type<Array<{ name: string; oeNumber?: string }>>().notNull().default([]),
    repairDate: text("repair_date"),
    costMinor: integer("cost_minor"),
    currency: text("currency"),
    outcome: text("outcome", { enum: ["resolved", "persisted", "partially", "unknown"] }).notNull().default("unknown"),
    attachmentIds: jsonb("attachment_ids").$type<string[]>().notNull().default([]),
    status: text("status", { enum: ["submitted", "needs_review", "verified", "rejected", "inconclusive"] }).notNull().default("submitted"),
    /** Content fingerprint for duplicate detection (not an anonymisation mechanism). */
    fingerprint: text("fingerprint").notNull(),
    flags: jsonb("flags").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("rcase_user_idx").on(t.userId), index("rcase_status_idx").on(t.status), index("rcase_fp_idx").on(t.fingerprint)],
);

export const repairOutcomes = pgTable("repair_outcomes", {
  id: pk(),
  caseId: uuid("case_id").notNull().references(() => repairCases.id, { onDelete: "cascade" }),
  outcome: text("outcome", { enum: ["resolved", "persisted", "partially", "unknown"] }).notNull(),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const expertReviews = pgTable(
  "expert_reviews",
  {
    id: pk(),
    caseId: uuid("case_id").notNull().references(() => repairCases.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id").notNull().references(() => users.id),
    decision: text("decision", { enum: ["verified", "rejected", "inconclusive", "needs_review"] }).notNull(),
    notes: text("notes").notNull(),
    evidence: jsonb("evidence").$type<string[]>().notNull().default([]),
    guidelineVersion: text("guideline_version").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("xrev_case_idx").on(t.caseId)],
);

/** Learning consent is separate from Terms acceptance, opt-in, versioned and withdrawable. */
export const consentRecords = pgTable(
  "consent_records",
  {
    id: pk(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: ["learning"] }).notNull(),
    textVersion: text("text_version").notNull(),
    sources: jsonb("sources").$type<string[]>().notNull(),
    grantedAt: ts("granted_at").notNull(),
    withdrawnAt: ts("withdrawn_at"),
    createdAt: createdAt(),
  },
  (t) => [index("consent_user_idx").on(t.userId, t.purpose)],
);

/**
 * De-identified copy used for improvement. Lives apart from the user's record,
 * readable only by reviewer/sysadmin roles. `sourceCaseId` is kept (restricted)
 * solely so withdrawal can remove the copy; it is never exported.
 */
export const learningCaseCopies = pgTable(
  "learning_case_copies",
  {
    id: pk(),
    sourceCaseId: uuid("source_case_id").notNull().references(() => repairCases.id, { onDelete: "cascade" }),
    consentRecordId: uuid("consent_record_id").notNull().references(() => consentRecords.id),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** Group key so a case and its derivatives land in the same split. */
    groupKey: text("group_key").notNull(),
    status: text("status", { enum: ["eligible", "withdrawn"] }).notNull().default("eligible"),
    createdAt: createdAt(),
    withdrawnAt: ts("withdrawn_at"),
  },
  (t) => [uniqueIndex("lcopy_case_uq").on(t.sourceCaseId)],
);

export const datasetVersions = pgTable("dataset_versions", {
  id: pk(),
  name: text("name").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  splitSeed: text("split_seed").notNull(),
  manifest: jsonb("manifest").$type<{ train: string[]; test: string[]; consentTextVersions: string[] }>().notNull(),
  caseCount: integer("case_count").notNull(),
  status: text("status", { enum: ["draft", "approved", "used_in_training", "retired"] }).notNull().default("draft"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: ts("approved_at"),
  createdAt: createdAt(),
});

export const modelVersions = pgTable("model_versions", {
  id: pk(),
  name: text("name").notNull(),
  runtime: text("runtime").notNull().default("ollama"),
  baseModel: text("base_model").notNull(),
  adapterRef: text("adapter_ref"),
  license: text("license").notNull(),
  datasetVersionId: uuid("dataset_version_id").references(() => datasetVersions.id),
  status: text("status", { enum: ["candidate", "approved", "active", "retired"] }).notNull().default("candidate"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: ts("approved_at"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const evaluationRuns = pgTable("evaluation_runs", {
  id: pk(),
  modelName: text("model_name").notNull(),
  modelVersionId: uuid("model_version_id").references(() => modelVersions.id),
  evalSet: text("eval_set").notNull(),
  /** Whether ground truth was expert-reviewed. Synthetic sets must say so. */
  groundTruth: text("ground_truth", { enum: ["expert_reviewed", "synthetic_unreviewed"] }).notNull(),
  metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull(),
  environment: jsonb("environment").$type<Record<string, unknown>>().notNull(),
  ranBy: uuid("ran_by").references(() => users.id),
  createdAt: createdAt(),
});
