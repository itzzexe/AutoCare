import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { MaintenanceRecordInput, ReminderInput } from "@autocare/contracts";
import type { z } from "zod";
import { getDb } from "../../db/client";
import { maintenanceRecords, maintenanceReminders, notifications, vehicles } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { getOwnedVehicle } from "../vehicles/service";

export async function listRecords(userId: string, vehicleId: string) {
  await getOwnedVehicle(userId, vehicleId);
  const db = await getDb();
  return db.select().from(maintenanceRecords).where(and(eq(maintenanceRecords.vehicleId, vehicleId), eq(maintenanceRecords.userId, userId))).orderBy(desc(maintenanceRecords.performedAt)).limit(200);
}

export async function addRecord(userId: string, vehicleId: string, input: z.output<typeof MaintenanceRecordInput>) {
  const v = await getOwnedVehicle(userId, vehicleId);
  const db = await getDb();
  const [r] = await db.insert(maintenanceRecords).values({ vehicleId, userId, kind: input.kind, performedAt: input.performedAt, odometer: input.odometer ?? null, notes: input.notes, costMinor: input.costMinor ?? null, currency: input.currency ?? null }).returning();
  if (input.odometer && (!v.odometer || input.odometer > v.odometer)) {
    await db.update(vehicles).set({ odometer: input.odometer, updatedAt: new Date() }).where(eq(vehicles.id, vehicleId));
  }
  return r!;
}

export async function deleteRecord(userId: string, recordId: string) {
  const db = await getDb();
  const rows = await db.delete(maintenanceRecords).where(and(eq(maintenanceRecords.id, recordId), eq(maintenanceRecords.userId, userId))).returning({ id: maintenanceRecords.id });
  if (!rows[0]) throw new AppError("not_found");
}

export async function listReminders(userId: string, vehicleId: string) {
  await getOwnedVehicle(userId, vehicleId);
  const db = await getDb();
  return db.select().from(maintenanceReminders).where(and(eq(maintenanceReminders.vehicleId, vehicleId), eq(maintenanceReminders.userId, userId))).orderBy(maintenanceReminders.dueDate);
}

/** User-entered reminder. Source-schedule reminders are only created from a licensed maintenance schedule provider. */
export async function addReminder(userId: string, vehicleId: string, input: z.output<typeof ReminderInput>) {
  await getOwnedVehicle(userId, vehicleId);
  const db = await getDb();
  const [r] = await db.insert(maintenanceReminders).values({ vehicleId, userId, title: input.title, dueDate: input.dueDate ?? null, dueOdometer: input.dueOdometer ?? null, origin: "user" }).returning();
  return r!;
}

export async function setReminderStatus(userId: string, reminderId: string, status: "done" | "dismissed" | "active") {
  const db = await getDb();
  const rows = await db.update(maintenanceReminders).set({ status }).where(and(eq(maintenanceReminders.id, reminderId), eq(maintenanceReminders.userId, userId))).returning({ id: maintenanceReminders.id });
  if (!rows[0]) throw new AppError("not_found");
}

/**
 * Create in-app notifications for reminders that became due (by date, or by
 * odometer when the vehicle's last known reading reaches the threshold).
 * Called on dashboard load; e-mail/SMS delivery is a separate, unconfigured integration.
 */
export async function sweepDueReminders(userId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ r: maintenanceReminders, odo: vehicles.odometer, make: vehicles.make, model: vehicles.model })
    .from(maintenanceReminders)
    .innerJoin(vehicles, eq(vehicles.id, maintenanceReminders.vehicleId))
    .where(and(eq(maintenanceReminders.userId, userId), eq(maintenanceReminders.status, "active"), isNull(maintenanceReminders.notifiedAt)));
  const today = new Date().toISOString().slice(0, 10);
  let n = 0;
  for (const { r, odo, make, model } of rows) {
    const dueByDate = r.dueDate != null && r.dueDate <= today;
    const dueByOdo = r.dueOdometer != null && odo != null && odo >= r.dueOdometer;
    if (!dueByDate && !dueByOdo) continue;
    await db.insert(notifications).values({ userId, kind: "maintenance_due", titleAr: `صيانة مستحقة: ${r.title} — ${make} ${model}`, titleEn: `Maintenance due: ${r.title} — ${make} ${model}`, link: `/garage/${r.vehicleId}` });
    await db.update(maintenanceReminders).set({ notifiedAt: new Date() }).where(eq(maintenanceReminders.id, r.id));
    n++;
  }
  return n;
}
