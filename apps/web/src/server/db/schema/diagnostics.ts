import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, encrypted, pk, ts, updatedAt } from "./common";
import { users } from "./identity";
import { sourceRecords, vehicleVariants } from "./knowledge";

export const vehicles = pgTable(
  "vehicles",
  {
    id: pk(),
    ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    nickname: text("nickname"),
    make: text("make").notNull(),
    model: text("model").notNull(),
    year: integer("year").notNull(),
    engine: text("engine"),
    fuel: text("fuel").notNull(),
    transmission: text("transmission").notNull(),
    salesMarket: text("sales_market").notNull(),
    odometer: integer("odometer"),
    odometerUnit: text("odometer_unit", { enum: ["km", "mi"] }).notNull().default("km"),
    /** Full VIN, AES-256-GCM encrypted. */
    vinEnc: encrypted("vin_enc"),
    /** Masked form for display (WMI + last 4). */
    vinMasked: text("vin_masked"),
    vinDecode: jsonb("vin_decode").$type<Record<string, unknown>>(),
    vinDecodeSourceId: uuid("vin_decode_source_id").references(() => sourceRecords.id),
    vinDataConfirmedAt: ts("vin_data_confirmed_at"),
    variantId: uuid("variant_id").references(() => vehicleVariants.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("vehicles_owner_idx").on(t.ownerId)],
);

export const diagnosticSessions = pgTable(
  "diagnostic_sessions",
  {
    id: pk(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["in_progress", "awaiting_checks", "completed", "abandoned"] }).notNull().default("in_progress"),
    step: text("step", { enum: ["codes", "context", "checks", "result"] }).notNull().default("codes"),
    codes: jsonb("codes").$type<Array<{ raw: string; code: string; format: string; scope: string; failureType?: string }>>().notNull().default([]),
    symptoms: text("symptoms").notNull().default(""),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("dsess_user_idx").on(t.userId, t.updatedAt)],
);

export const diagnosticObservations = pgTable(
  "diagnostic_observations",
  {
    id: pk(),
    sessionId: uuid("session_id").notNull().references(() => diagnosticSessions.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["code", "symptom", "context", "check_result", "note"] }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("dobs_session_idx").on(t.sessionId)],
);

export const diagnosticRecommendations = pgTable(
  "diagnostic_recommendations",
  {
    id: pk(),
    sessionId: uuid("session_id").notNull().references(() => diagnosticSessions.id, { onDelete: "cascade" }),
    /** Deterministic rules output (urgency, safety referral, ordered checks). */
    rulesResult: jsonb("rules_result").$type<Record<string, unknown>>().notNull(),
    /** Validated model output or null when the model was unavailable/failed validation. */
    modelResult: jsonb("model_result").$type<Record<string, unknown>>(),
    urgency: text("urgency", { enum: ["stop_driving", "urgent", "soon", "monitor", "insufficient_info"] }).notNull(),
    rulesVersion: text("rules_version").notNull(),
    modelName: text("model_name"),
    promptVersion: text("prompt_version"),
    modelStatus: text("model_status", { enum: ["ok", "disabled", "unavailable", "timeout", "invalid_output", "busy", "skipped_safety", "skipped_no_coverage"] }).notNull(),
    sourceIds: jsonb("source_ids").$type<string[]>().notNull().default([]),
    latencyMs: integer("latency_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("drec_session_idx").on(t.sessionId)],
);

/** Revocable, expiring report share links. Only the token hash is stored. */
export const reportShares = pgTable(
  "report_shares",
  {
    id: pk(),
    sessionId: uuid("session_id").notNull().references(() => diagnosticSessions.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    /** Optional: restrict to members of one workshop (must be logged in). */
    workshopId: uuid("workshop_id"),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    accessCount: integer("access_count").notNull().default(0),
    lastAccessAt: ts("last_access_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("report_shares_token_uq").on(t.tokenHash)],
);

// ---------------- maintenance ----------------

export const maintenanceRecords = pgTable(
  "maintenance_records",
  {
    id: pk(),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    performedAt: text("performed_at").notNull(),
    odometer: integer("odometer"),
    notes: text("notes"),
    costMinor: integer("cost_minor"),
    currency: text("currency"),
    createdAt: createdAt(),
  },
  (t) => [index("mrec_vehicle_idx").on(t.vehicleId)],
);

export const maintenanceReminders = pgTable(
  "maintenance_reminders",
  {
    id: pk(),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    dueDate: text("due_date"),
    dueOdometer: integer("due_odometer"),
    /** user = entered by the owner; source_schedule = from a licensed maintenance schedule. */
    origin: text("origin", { enum: ["user", "source_schedule"] }).notNull().default("user"),
    sourceRecordId: uuid("source_record_id").references(() => sourceRecords.id),
    status: text("status", { enum: ["active", "done", "dismissed"] }).notNull().default("active"),
    notifiedAt: ts("notified_at"),
    createdAt: createdAt(),
  },
  (t) => [index("mrem_vehicle_idx").on(t.vehicleId)],
);

