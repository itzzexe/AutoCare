import { index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, pk, ts } from "./common";
import { users } from "./identity";

/**
 * Uploaded files. Stored under a random key in private storage, outside the
 * web root. Status starts at `quarantined`; only `clean` files are ever served.
 */
export const uploads = pgTable(
  "uploads",
  {
    id: pk(),
    ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: ["case_attachment", "product_image", "merchant_document"] }).notNull(),
    storageKey: text("storage_key").notNull(),
    detectedMime: text("detected_mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    sha256: text("sha256").notNull(),
    status: text("status", { enum: ["quarantined", "clean", "rejected", "infected", "scan_unavailable"] }).notNull().default("quarantined"),
    statusReason: text("status_reason"),
    scanEngine: text("scan_engine"),
    scannedAt: ts("scanned_at"),
    createdAt: createdAt(),
  },
  (t) => [index("uploads_owner_idx").on(t.ownerId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    titleAr: text("title_ar").notNull(),
    titleEn: text("title_en").notNull(),
    /** Internal relative link only (validated to start with "/"). */
    link: text("link"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notif_user_idx").on(t.userId, t.createdAt)],
);

/**
 * Append-only audit trail. The application DB role is granted INSERT/SELECT
 * only on this table (ops/sql/roles.sql). This is NOT tamper-proof against a
 * database superuser; see SECURITY.md.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: pk(),
    at: createdAt(),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    targetKind: text("target_kind"),
    targetId: text("target_id"),
    requestId: text("request_id"),
    ipPrefix: text("ip_prefix"),
    /** Already-redacted metadata. Never contains secrets, tokens, full VINs or phone numbers. */
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("audit_at_idx").on(t.at), index("audit_actor_idx").on(t.actorUserId), index("audit_action_idx").on(t.action)],
);

/** Per-request AI usage metering (for quotas and monitoring). */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: pk(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["diagnosis", "embedding", "evaluation"] }).notNull(),
    model: text("model").notNull(),
    status: text("status").notNull(),
    promptTokens: integer("prompt_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_user_idx").on(t.userId, t.createdAt)],
);

