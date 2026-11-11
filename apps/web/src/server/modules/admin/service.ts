import "server-only";
import { and, desc, eq, ilike, lt, sql } from "drizzle-orm";
import { getDb } from "../../db/client";
import { auditEvents, coverageRecords, dataProviders, licensePolicies, outbox, userRoles, users } from "../../db/schema";
import { decryptField } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { audit } from "../audit/audit";
import { devOutboxEnabled } from "../identity/service";
import { allProviderStatuses } from "../providers/registry";
import type { ProviderId } from "../providers/types";

export async function searchUsers(actorId: string, q: string | undefined, requestId?: string) {
  const db = await getDb();
  const where = q ? ilike(users.email, `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`) : undefined;
  const rows = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName, status: users.status, createdAt: users.createdAt, emailVerifiedAt: users.emailVerifiedAt, mfaEnabledAt: users.mfaEnabledAt })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(50);
  const roles = await db.select().from(userRoles);
  await audit({ action: "admin.user_viewed", actorUserId: actorId, requestId, meta: { query: q ? "set" : "none", results: rows.length } });
  return rows.map((r) => ({ ...r, roles: roles.filter((x) => x.userId === r.id).map((x) => x.roleId) }));
}

export async function auditLog(actorId: string, opts: { action?: string; before?: string }, requestId?: string) {
  const db = await getDb();
  const conds = [];
  if (opts.action) conds.push(eq(auditEvents.action, opts.action));
  if (opts.before) conds.push(lt(auditEvents.at, new Date(opts.before)));
  const rows = await db.select().from(auditEvents).where(conds.length ? and(...conds) : undefined).orderBy(desc(auditEvents.at)).limit(100);
  await audit({ action: "admin.audit_viewed", actorUserId: actorId, requestId });
  return rows;
}

export async function providerOverview() {
  const db = await getDb();
  const statuses = await allProviderStatuses();
  const coverage = await db.select().from(coverageRecords).orderBy(coverageRecords.make).limit(500);
  return { providers: statuses, coverage };
}

export async function setProviderEnabled(actorId: string, id: ProviderId, enabled: boolean, note: string, requestId?: string) {
  const db = await getDb();
  await db.update(dataProviders).set({ status: enabled ? "active" : "disabled", statusNote: note, updatedAt: new Date() }).where(eq(dataProviders.id, id));
  await audit({ action: "provider.status_changed", actorUserId: actorId, targetKind: "provider", targetId: id, requestId, meta: { enabled, note } });
}

export async function recordLicensePolicy(
  actorId: string,
  input: { providerId: ProviderId; version: string; allowDisplay: boolean; allowCache: boolean; cacheTtlSeconds: number; allowTranslation: boolean; allowOffline: boolean; allowEmbeddings: boolean; allowTraining: boolean; allowRedistribution: boolean; validFrom: string; validUntil?: string; agreementRef: string; notes?: string },
  requestId?: string,
) {
  if (input.providerId === "mock_test") throw new AppError("bad_request");
  const db = await getDb();
  const [p] = await db
    .insert(licensePolicies)
    .values({ ...input, validFrom: new Date(input.validFrom), validUntil: input.validUntil ? new Date(input.validUntil) : null, recordedBy: actorId })
    .returning();
  await audit({ action: "provider.license_recorded", actorUserId: actorId, targetKind: "provider", targetId: input.providerId, requestId, meta: { version: input.version, embeddings: input.allowEmbeddings, training: input.allowTraining } });
  return p!;
}

export async function upsertCoverage(
  actorId: string,
  input: { providerId: ProviderId; make: string; model?: string; yearFrom?: number; yearTo?: number; engine?: string; market?: string; system: (typeof coverageRecords.$inferInsert)["system"]; status: (typeof coverageRecords.$inferInsert)["status"]; evidenceNote?: string },
  requestId?: string,
) {
  if (input.status === "verified_sample" && !input.evidenceNote) throw new AppError("validation_failed", "evidence_required_for_verified", { fields: { evidenceNote: ["required"] } });
  const db = await getDb();
  const [row] = await db.insert(coverageRecords).values({ ...input, checkedAt: new Date(), checkedBy: actorId }).returning();
  await audit({ action: "knowledge.coverage_changed", actorUserId: actorId, targetKind: "coverage", targetId: row!.id, requestId, meta: { make: input.make, system: input.system, status: input.status } });
  return row!;
}

/** Development only: shows queued e-mails (verification/reset links) since no mail provider is configured. */
export async function devOutbox(actorId: string, requestId?: string) {
  if (!devOutboxEnabled()) throw new AppError("not_found");
  const db = await getDb();
  const rows = await db.select().from(outbox).orderBy(desc(outbox.createdAt)).limit(30);
  await audit({ action: "admin.outbox_viewed", actorUserId: actorId, requestId });
  return rows.map((r) => ({ id: r.id, template: r.template, status: r.status, createdAt: r.createdAt, payload: JSON.parse(decryptField(r.payloadEnc, "outbox")) as Record<string, string> }));
}

export async function platformCounts() {
  const db = await getDb();
  const q = async (table: string) => {
    const res = (await db.execute(sql.raw(`select count(*)::int as n from ${table}`))) as unknown as { rows: Array<{ n: number }> };
    return Number(res.rows?.[0]?.n ?? 0);
  };
  // Table names are constants above, not user input.
  return {
    users: await q("users"),
    vehicles: await q("vehicles"),
    sessions: await q("diagnostic_sessions"),
    cases: await q("repair_cases"),
    orders: await q("orders"),
    merchants: await q("merchants"),
    workshops: await q("workshops"),
  };
}
