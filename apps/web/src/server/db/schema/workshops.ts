import { index, integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, encrypted, pk, ts, updatedAt } from "./common";
import { diagnosticSessions, reportShares, vehicles } from "./diagnostics";
import { users } from "./identity";

export const workshops = pgTable(
  "workshops",
  {
    id: pk(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    governorate: text("governorate").notNull(),
    city: text("city").notNull(),
    address: text("address").notNull(),
    phoneEnc: encrypted("phone_enc").notNull(),
    specialties: jsonb("specialties").$type<string[]>().notNull(),
    brands: jsonb("brands").$type<string[]>().notNull().default([]),
    status: text("status", { enum: ["pending", "approved", "suspended", "rejected"] }).notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: ts("reviewed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("workshops_gov_idx").on(t.governorate, t.status)],
);

export const workshopMembers = pgTable(
  "workshop_members",
  {
    workshopId: uuid("workshop_id").notNull().references(() => workshops.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "mechanic"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workshopId, t.userId] })],
);

export const appointments = pgTable(
  "appointments",
  {
    id: pk(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workshopId: uuid("workshop_id").notNull().references(() => workshops.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
    /** Vehicle summary visible to the workshop (no VIN unless the owner shares it later). */
    vehicleSnapshot: jsonb("vehicle_snapshot").$type<Record<string, unknown>>().notNull(),
    preferredAt: ts("preferred_at").notNull(),
    confirmedAt: ts("confirmed_at"),
    proposedAt: ts("proposed_at"),
    status: text("status", { enum: ["requested", "confirmed", "declined", "rescheduled", "completed", "cancelled", "no_show"] }).notNull().default("requested"),
    note: text("note"),
    /** Report shared by the owner for this appointment, if any. */
    reportShareId: uuid("report_share_id").references(() => reportShares.id, { onDelete: "set null" }),
    diagnosticSessionId: uuid("diagnostic_session_id").references(() => diagnosticSessions.id, { onDelete: "set null" }),
    history: jsonb("history").$type<Array<{ status: string; at: string; by: string; note?: string }>>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("appt_workshop_idx").on(t.workshopId, t.status), index("appt_user_idx").on(t.userId)],
);

export const workOrders = pgTable(
  "work_orders",
  {
    id: pk(),
    workshopId: uuid("workshop_id").notNull().references(() => workshops.id, { onDelete: "cascade" }),
    appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
    checks: jsonb("checks").$type<Array<{ name: string; result: string }>>().notNull().default([]),
    quoteMinor: integer("quote_minor"),
    currency: text("currency"),
    resultNotes: text("result_notes"),
    status: text("status", { enum: ["open", "quoted", "in_progress", "done", "cancelled"] }).notNull().default("open"),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("wo_workshop_idx").on(t.workshopId)],
);
