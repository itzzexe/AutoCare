import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { AppointmentInput, AppointmentStatusInput, WorkOrderInput, WorkshopApplyInput } from "@autocare/contracts";
import type { z } from "zod";
import { getDb, type Tx } from "../../db/client";
import { appointments, diagnosticSessions, notifications, reportShares, reviews, userRoles, workOrders, workshopMembers, workshops } from "../../db/schema";
import { encryptField, randomToken, sha256Hex } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { activePaidSubjects } from "../billing/service";
import { audit } from "../audit/audit";
import { revokeAllSessions } from "../identity/sessions";
import { getOwnedVehicle, vehicleSnapshot } from "../vehicles/service";

type Status = (typeof appointments.$inferSelect)["status"];

async function notify(tx: Tx, userIds: string[], kind: string, titleAr: string, titleEn: string, link: string) {
  if (userIds.length) await tx.insert(notifications).values(userIds.map((userId) => ({ userId, kind, titleAr, titleEn, link })));
}

export async function applyWorkshop(userId: string, input: z.output<typeof WorkshopApplyInput>, requestId?: string) {
  const db = await getDb();
  const [existing] = await db.select({ id: workshops.id }).from(workshops).where(eq(workshops.ownerUserId, userId)).limit(1);
  if (existing) throw new AppError("conflict", "already_applied");
  return db.transaction(async (tx) => {
    const id = crypto.randomUUID();
    const [w] = await tx
      .insert(workshops)
      .values({ id, ownerUserId: userId, name: input.name, governorate: input.governorate, city: input.city, address: input.address, phoneEnc: encryptField(input.phone, `workshop:${id}:phone`), specialties: input.specialties, brands: input.brands })
      .returning();
    await tx.insert(workshopMembers).values({ workshopId: id, userId, role: "owner" });
    await audit({ action: "workshop.applied", actorUserId: userId, targetKind: "workshop", targetId: id, requestId }, tx);
    return w!;
  });
}

export async function moderateWorkshop(moderatorId: string, workshopId: string, status: "approved" | "suspended" | "rejected", requestId?: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [w] = await tx.update(workshops).set({ status, reviewedBy: moderatorId, reviewedAt: new Date() }).where(eq(workshops.id, workshopId)).returning();
    if (!w) throw new AppError("not_found");
    if (status === "approved") await tx.insert(userRoles).values({ userId: w.ownerUserId, roleId: "workshop", grantedBy: moderatorId }).onConflictDoNothing();
    else await tx.delete(userRoles).where(and(eq(userRoles.userId, w.ownerUserId), eq(userRoles.roleId, "workshop")));
    await revokeAllSessions(w.ownerUserId, `workshop_${status}`, undefined, tx);
    await notify(tx, [w.ownerUserId], "workshop_status", `حالة الورشة: ${status}`, `Workshop status: ${status}`, "/workshop");
    await audit({ action: "workshop.status_changed", actorUserId: moderatorId, targetKind: "workshop", targetId: workshopId, requestId, meta: { status } }, tx);
  });
}

export async function listWorkshopsForModeration() {
  const db = await getDb();
  return (await db.select().from(workshops).orderBy(desc(workshops.createdAt)).limit(100)).map(({ phoneEnc: _p, ...w }) => w);
}

/** Public directory: approved workshops only, with ratings from verified service reviews. */
export async function directory(filters: { governorate?: string; specialty?: string; brand?: string }) {
  const db = await getDb();
  const conds = [eq(workshops.status, "approved")];
  if (filters.governorate) conds.push(eq(workshops.governorate, filters.governorate));
  if (filters.specialty) conds.push(sql`${workshops.specialties} @> ${JSON.stringify([filters.specialty])}::jsonb`);
  if (filters.brand) conds.push(sql`exists (select 1 from jsonb_array_elements_text(${workshops.brands}) b where lower(b) = lower(${filters.brand}))`);
  const rows = await db.select().from(workshops).where(and(...conds)).orderBy(workshops.name).limit(100);
  const ratings = rows.length
    ? await db
        .select({ id: reviews.targetId, avg: sql<number>`avg(${reviews.rating})::float`, n: sql<number>`count(*)::int` })
        .from(reviews)
        .where(and(eq(reviews.targetKind, "workshop"), eq(reviews.status, "published"), inArray(reviews.targetId, rows.map((r) => r.id))))
        .groupBy(reviews.targetId)
    : [];
  const featured = await activePaidSubjects("workshop", rows.map((r) => r.id), "featuredListing");
  return rows.map(({ phoneEnc: _p, ownerUserId: _o, reviewedBy: _r, ...w }) => ({ ...w, featured: featured.has(w.id), rating: ratings.find((r) => r.id === w.id) ?? null }));
}

export async function workshopOf(userId: string) {
  const db = await getDb();
  const [r] = await db.select({ w: workshops, role: workshopMembers.role }).from(workshopMembers).innerJoin(workshops, eq(workshops.id, workshopMembers.workshopId)).where(eq(workshopMembers.userId, userId)).limit(1);
  return r ?? null;
}

async function approvedWorkshopOf(userId: string) {
  const r = await workshopOf(userId);
  if (!r) throw new AppError("forbidden", "not_a_workshop_member");
  if (r.w.status !== "approved") throw new AppError("forbidden", "workshop_not_approved");
  return r.w;
}

export async function bookAppointment(userId: string, input: z.output<typeof AppointmentInput>, requestId?: string) {
  const v = await getOwnedVehicle(userId, input.vehicleId);
  const when = new Date(input.preferredAt);
  if (when.getTime() < Date.now() + 30 * 60_000 || when.getTime() > Date.now() + 90 * 24 * 3_600_000) throw new AppError("validation_failed", "time_out_of_range", { fields: { preferredAt: ["out_of_range"] } });
  const db = await getDb();
  const [w] = await db.select().from(workshops).where(and(eq(workshops.id, input.workshopId), eq(workshops.status, "approved"))).limit(1);
  if (!w) throw new AppError("not_found");
  return db.transaction(async (tx) => {
    let shareId: string | null = null;
    if (input.shareDiagnosticSessionId) {
      const [s] = await tx.select({ id: diagnosticSessions.id }).from(diagnosticSessions).where(and(eq(diagnosticSessions.id, input.shareDiagnosticSessionId), eq(diagnosticSessions.userId, userId))).limit(1);
      if (!s) throw new AppError("not_found");
      // Explicit owner action: a report-only share restricted to this workshop's members.
      const [sh] = await tx
        .insert(reportShares)
        .values({ sessionId: s.id, createdBy: userId, tokenHash: sha256Hex(randomToken(24)), workshopId: w.id, expiresAt: new Date(Date.now() + 14 * 24 * 3_600_000) })
        .returning({ id: reportShares.id });
      shareId = sh!.id;
    }
    const [a] = await tx
      .insert(appointments)
      .values({ userId, workshopId: w.id, vehicleId: v.id, vehicleSnapshot: vehicleSnapshot(v), preferredAt: when, note: input.note, reportShareId: shareId, diagnosticSessionId: shareId ? input.shareDiagnosticSessionId! : null, history: [{ status: "requested", at: new Date().toISOString(), by: "owner" }] })
      .returning();
    const members = (await tx.select({ u: workshopMembers.userId }).from(workshopMembers).where(eq(workshopMembers.workshopId, w.id))).map((r) => r.u);
    await notify(tx, members, "appointment_requested", "طلب موعد جديد", "New appointment request", "/workshop");
    await audit({ action: "appointment.status_changed", actorUserId: userId, targetKind: "appointment", targetId: a!.id, requestId, meta: { status: "requested", shared: Boolean(shareId) } }, tx);
    return a!;
  });
}

export async function myAppointments(userId: string) {
  const db = await getDb();
  return db
    .select({ a: appointments, workshopName: workshops.name, workshopCity: workshops.city })
    .from(appointments)
    .innerJoin(workshops, eq(workshops.id, appointments.workshopId))
    .where(eq(appointments.userId, userId))
    .orderBy(desc(appointments.preferredAt))
    .limit(50);
}

/** Workshop view: vehicle snapshot + note; no owner contact data or other vehicles. */
export async function workshopAppointments(userId: string) {
  const w = await approvedWorkshopOf(userId);
  const db = await getDb();
  const rows = await db.select().from(appointments).where(eq(appointments.workshopId, w.id)).orderBy(desc(appointments.preferredAt)).limit(100);
  const wos = rows.length ? await db.select().from(workOrders).where(inArray(workOrders.appointmentId, rows.map((r) => r.id))) : [];
  return rows.map(({ userId: _u, vehicleId: _v, ...a }) => ({ ...a, hasSharedReport: Boolean(a.reportShareId), workOrders: wos.filter((x) => x.appointmentId === a.id) }));
}

const WORKSHOP_TRANSITIONS: Partial<Record<Status, Status[]>> = {
  requested: ["confirmed", "declined", "rescheduled"],
  rescheduled: ["confirmed", "declined"],
  confirmed: ["completed", "no_show", "rescheduled"],
};

export async function setAppointmentStatus(userId: string, appointmentId: string, input: z.output<typeof AppointmentStatusInput>, requestId?: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [a] = await tx.select().from(appointments).where(eq(appointments.id, appointmentId)).for("update").limit(1);
    if (!a) throw new AppError("not_found");
    const isOwner = a.userId === userId;
    let actor: "owner" | "workshop";
    if (isOwner) {
      // Owners may only cancel, or accept a rescheduled time.
      if (!(input.status === "cancelled" && ["requested", "confirmed", "rescheduled"].includes(a.status)) && !(input.status === "confirmed" && a.status === "rescheduled")) throw new AppError("conflict", "invalid_transition");
      actor = "owner";
    } else {
      const [m] = await tx.select().from(workshopMembers).where(and(eq(workshopMembers.workshopId, a.workshopId), eq(workshopMembers.userId, userId))).limit(1);
      if (!m) throw new AppError("not_found");
      if (!(WORKSHOP_TRANSITIONS[a.status] ?? []).includes(input.status)) throw new AppError("conflict", "invalid_transition");
      if (input.status === "rescheduled" && !input.proposedAt) throw new AppError("validation_failed", "proposed_time_required");
      actor = "workshop";
    }
    await tx
      .update(appointments)
      .set({
        status: input.status,
        proposedAt: input.proposedAt ? new Date(input.proposedAt) : a.proposedAt,
        confirmedAt: input.status === "confirmed" ? new Date() : a.confirmedAt,
        updatedAt: new Date(),
        history: [...a.history, { status: input.status, at: new Date().toISOString(), by: actor, note: input.note }],
      })
      .where(eq(appointments.id, a.id));
    if (actor === "workshop") await notify(tx, [a.userId], "appointment_status", `تحديث الموعد: ${input.status}`, `Appointment update: ${input.status}`, "/workshops/appointments");
    await audit({ action: "appointment.status_changed", actorUserId: userId, targetKind: "appointment", targetId: a.id, requestId, meta: { from: a.status, to: input.status, actor } }, tx);
  });
}

/**
 * Report the owner explicitly shared with this workshop for an appointment.
 * Requires workshop membership AND a live (unexpired, unrevoked) share.
 */
export async function sharedReportForAppointment(userId: string, appointmentId: string) {
  const w = await approvedWorkshopOf(userId);
  const db = await getDb();
  const [a] = await db.select().from(appointments).where(and(eq(appointments.id, appointmentId), eq(appointments.workshopId, w.id))).limit(1);
  if (!a?.reportShareId || !a.diagnosticSessionId) throw new AppError("not_found");
  const [share] = await db.select().from(reportShares).where(eq(reportShares.id, a.reportShareId)).limit(1);
  if (!share || share.revokedAt || share.expiresAt < new Date() || share.workshopId !== w.id) throw new AppError("not_found");
  const { diagnosticRecommendations } = await import("../../db/schema");
  const [s] = await db.select().from(diagnosticSessions).where(eq(diagnosticSessions.id, a.diagnosticSessionId)).limit(1);
  const [rec] = await db.select().from(diagnosticRecommendations).where(eq(diagnosticRecommendations.sessionId, a.diagnosticSessionId)).orderBy(desc(diagnosticRecommendations.createdAt)).limit(1);
  await audit({ action: "report.share_accessed", actorUserId: userId, targetKind: "report_share", targetId: share.id });
  return { vehicle: a.vehicleSnapshot, codes: s?.codes ?? [], symptoms: s?.symptoms ?? "", latest: rec ?? null, expiresAt: share.expiresAt };
}

export async function upsertWorkOrder(userId: string, input: z.output<typeof WorkOrderInput>, workOrderId?: string) {
  const w = await approvedWorkshopOf(userId);
  const db = await getDb();
  const [a] = await db.select().from(appointments).where(and(eq(appointments.id, input.appointmentId), eq(appointments.workshopId, w.id))).limit(1);
  if (!a) throw new AppError("not_found");
  const values = { checks: input.checks, quoteMinor: input.quoteMinor ?? null, currency: input.currency ?? null, resultNotes: input.resultNotes ?? null, status: input.status, updatedAt: new Date() };
  if (workOrderId) {
    const [r] = await db.update(workOrders).set(values).where(and(eq(workOrders.id, workOrderId), eq(workOrders.workshopId, w.id))).returning();
    if (!r) throw new AppError("not_found");
    return r;
  }
  const [r] = await db.insert(workOrders).values({ ...values, workshopId: w.id, appointmentId: a.id, createdBy: userId }).returning();
  return r!;
}

/** Owner can read work orders on their own appointments. */
export async function myWorkOrders(userId: string, appointmentId: string) {
  const db = await getDb();
  const [a] = await db.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.id, appointmentId), eq(appointments.userId, userId))).limit(1);
  if (!a) throw new AppError("not_found");
  return db.select().from(workOrders).where(eq(workOrders.appointmentId, appointmentId));
}

export async function reviewWorkshop(userId: string, appointmentId: string, rating: number, body: string) {
  const db = await getDb();
  const [a] = await db.select().from(appointments).where(and(eq(appointments.id, appointmentId), eq(appointments.userId, userId))).limit(1);
  if (!a) throw new AppError("not_found");
  if (a.status !== "completed") throw new AppError("conflict", "review_requires_completed_service");
  const ins = await db.insert(reviews).values({ authorId: userId, targetKind: "workshop", targetId: a.workshopId, proofKind: "appointment", proofId: a.id, rating, body }).onConflictDoNothing().returning();
  if (!ins[0]) throw new AppError("conflict", "already_reviewed");
  return ins[0];
}
