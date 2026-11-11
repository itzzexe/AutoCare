import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../../db/client";
import {
  appointments, consentRecords, diagnosticSessions, maintenanceRecords, maintenanceReminders, notifications, offerRequests, orders,
  repairCases, reportShares, users, vehicles,
} from "../../db/schema";
import { decryptField } from "../../lib/crypto";
import { audit } from "../audit/audit";
import { revokeAllSessions } from "../identity/sessions";
import { withdrawConsent } from "../learning/service";

/** Machine-readable export of the user's own data (JSON). */
export async function exportMyData(userId: string, requestId?: string) {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const vs = await db.select().from(vehicles).where(and(eq(vehicles.ownerId, userId), isNull(vehicles.deletedAt)));
  const data = {
    exportedAt: new Date().toISOString(),
    account: { email: u?.email, displayName: u?.displayName, locale: u?.locale, createdAt: u?.createdAt, termsVersion: u?.termsVersion, mfaEnabled: Boolean(u?.mfaEnabledAt) },
    vehicles: vs.map((v) => ({ ...v, vinEnc: undefined, vin: v.vinEnc ? decryptField(v.vinEnc, `vehicle:${v.id}:vin`) : null })),
    diagnosticSessions: await db.select().from(diagnosticSessions).where(eq(diagnosticSessions.userId, userId)),
    repairCases: await db.select().from(repairCases).where(eq(repairCases.userId, userId)),
    consents: await db.select().from(consentRecords).where(eq(consentRecords.userId, userId)),
    maintenance: await db.select().from(maintenanceRecords).where(eq(maintenanceRecords.userId, userId)),
    reminders: await db.select().from(maintenanceReminders).where(eq(maintenanceReminders.userId, userId)),
    offerRequests: await db.select().from(offerRequests).where(eq(offerRequests.userId, userId)),
    orders: (await db.select().from(orders).where(eq(orders.userId, userId))).map(({ addressEnc, ...o }) => ({ ...o, address: addressEnc ? JSON.parse(decryptField(addressEnc, `order:${o.id}:address`)) : null })),
    appointments: await db.select().from(appointments).where(eq(appointments.userId, userId)),
  };
  await audit({ action: "account.export", actorUserId: userId, requestId });
  return data;
}

/**
 * Account deletion. Personal data is removed or detached; records other
 * parties legitimately rely on (merchant sub-orders, appointment history)
 * are kept without the buyer's contact details. Backups age out per
 * docs/BACKUP_RESTORE.md retention.
 */
export async function deleteAccount(userId: string, requestId?: string) {
  await withdrawConsent(userId, requestId);
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(users).set({
      email: `deleted-${userId}@deleted.invalid`,
      displayName: "—",
      phoneEnc: null,
      mfaSecretEnc: null,
      mfaEnabledAt: null,
      passwordHash: "!deleted",
      status: "deleted",
      deletedAt: new Date(),
    }).where(eq(users.id, userId));
    await tx.update(vehicles).set({ vinEnc: null, vinMasked: null, vinDecode: null, deletedAt: new Date() }).where(eq(vehicles.ownerId, userId));
    await tx.update(orders).set({ addressEnc: null }).where(eq(orders.userId, userId));
    await tx.update(reportShares).set({ revokedAt: new Date() }).where(eq(reportShares.createdBy, userId));
    await tx.delete(diagnosticSessions).where(eq(diagnosticSessions.userId, userId));
    await tx.delete(repairCases).where(eq(repairCases.userId, userId));
    await tx.delete(notifications).where(eq(notifications.userId, userId));
    await revokeAllSessions(userId, "account_deleted", undefined, tx);
    await audit({ action: "account.deleted", actorUserId: userId, targetKind: "user", targetId: userId, requestId }, tx);
  });
}

export async function myNotifications(userId: string) {
  const db = await getDb();
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50);
}

export async function markNotificationsRead(userId: string) {
  const db = await getDb();
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
