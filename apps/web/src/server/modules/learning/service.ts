import "server-only";
import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { searchKey, type RepairCaseInput } from "@autocare/contracts";
import type { z } from "zod";
import { getDb, type Tx } from "../../db/client";
import {
  consentRecords, datasetVersions, diagnosticSessions, evaluationRuns, expertReviews, knowledgeChunks, knowledgeDocuments,
  learningCaseCopies, modelVersions, repairCases, repairOutcomes, sourceRecords, uploads,
} from "../../db/schema";
import { sha256Hex } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { audit } from "../audit/audit";
import { chunkText } from "../ai/rag";
import { getOwnedVehicle, vehicleSnapshot } from "../vehicles/service";
import { groupKeyFor, toLearningPayload } from "./anonymize";

export const CONSENT_TEXT_VERSION = "learning-consent-2026.10-v1";
export const REVIEW_GUIDELINE_VERSION = "review-guide-2026.10-v1";

type CaseIn = z.output<typeof RepairCaseInput>;

// ---------------- consent ----------------

export async function activeConsent(userId: string, tx?: Tx) {
  const db = tx ?? (await getDb());
  const [c] = await db
    .select()
    .from(consentRecords)
    .where(and(eq(consentRecords.userId, userId), eq(consentRecords.purpose, "learning"), isNull(consentRecords.withdrawnAt)))
    .orderBy(desc(consentRecords.grantedAt))
    .limit(1);
  return c ?? null;
}

export async function setConsent(userId: string, granted: boolean, textVersion: string, sources: string[] | undefined, requestId?: string) {
  const db = await getDb();
  if (granted) {
    if (textVersion !== CONSENT_TEXT_VERSION) throw new AppError("conflict", "consent_text_outdated");
    const current = await activeConsent(userId);
    if (current) await db.update(consentRecords).set({ withdrawnAt: new Date() }).where(eq(consentRecords.id, current.id));
    const [row] = await db.insert(consentRecords).values({ userId, purpose: "learning", textVersion, sources: sources ?? ["repair_cases"], grantedAt: new Date() }).returning();
    await audit({ action: "consent.granted", actorUserId: userId, targetKind: "consent", targetId: row!.id, requestId, meta: { textVersion, sources: row!.sources } });
    return row!;
  }
  await withdrawConsent(userId, requestId);
  return null;
}

/**
 * Withdrawal: consent closed, improvement copies deleted, derived RAG documents
 * disabled. Datasets already exported/used for training cannot be "un-learned"
 * from model weights — see docs/PRIVACY_AND_CONSENT.md §Withdrawal.
 */
export async function withdrawConsent(userId: string, requestId?: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(consentRecords).set({ withdrawnAt: new Date() }).where(and(eq(consentRecords.userId, userId), isNull(consentRecords.withdrawnAt)));
    const caseIds = (await tx.select({ id: repairCases.id }).from(repairCases).where(eq(repairCases.userId, userId))).map((r) => r.id);
    if (caseIds.length) {
      const copies = await tx.select({ id: learningCaseCopies.id }).from(learningCaseCopies).where(inArray(learningCaseCopies.sourceCaseId, caseIds));
      if (copies.length) {
        const refs = copies.map((c) => c.id);
        const srcs = await tx.select({ id: sourceRecords.id }).from(sourceRecords).where(and(eq(sourceRecords.providerId, "internal_curated"), inArray(sourceRecords.externalRef, refs.map((r) => `learning_copy:${r}`))));
        if (srcs.length) {
          await tx.update(sourceRecords).set({ status: "disabled" }).where(inArray(sourceRecords.id, srcs.map((s) => s.id)));
          await tx.update(knowledgeDocuments).set({ status: "disabled", ragAllowed: false }).where(inArray(knowledgeDocuments.sourceRecordId, srcs.map((s) => s.id)));
        }
        await tx.delete(learningCaseCopies).where(inArray(learningCaseCopies.id, refs));
      }
    }
    await audit({ action: "consent.withdrawn", actorUserId: userId, targetKind: "consent", requestId }, tx);
  });
}

// ---------------- cases ----------------

function fingerprint(snapshot: Record<string, unknown>, codes: string[], cause: string | undefined) {
  return sha256Hex([snapshot.make, snapshot.model, snapshot.year, [...codes].sort().join(","), searchKey(cause ?? "")].join("|").toLowerCase());
}

export async function submitCase(userId: string, input: CaseIn, requestId?: string) {
  const db = await getDb();
  let snapshot: Record<string, unknown> = {};
  if (input.vehicleId) snapshot = vehicleSnapshot(await getOwnedVehicle(userId, input.vehicleId));
  if (input.diagnosticSessionId) {
    const [s] = await db.select({ id: diagnosticSessions.id }).from(diagnosticSessions).where(and(eq(diagnosticSessions.id, input.diagnosticSessionId), eq(diagnosticSessions.userId, userId))).limit(1);
    if (!s) throw new AppError("not_found");
  }
  if (input.attachmentIds.length) {
    const owned = await db.select({ id: uploads.id, status: uploads.status }).from(uploads).where(and(inArray(uploads.id, input.attachmentIds), eq(uploads.ownerId, userId), eq(uploads.purpose, "case_attachment")));
    if (owned.length !== input.attachmentIds.length) throw new AppError("not_found", "attachment_not_found");
    if (owned.some((u) => u.status !== "clean")) throw new AppError("conflict", "attachment_not_clean");
  }
  const fp = fingerprint(snapshot, input.codes, input.confirmedCause);
  const flags: string[] = [];
  const since = new Date(Date.now() - 30 * 24 * 3_600_000);
  const sameFp = await db.select({ userId: repairCases.userId }).from(repairCases).where(and(eq(repairCases.fingerprint, fp), gt(repairCases.createdAt, since)));
  if (sameFp.some((r) => r.userId === userId)) flags.push("duplicate_of_own_case");
  if (new Set(sameFp.filter((r) => r.userId !== userId).map((r) => r.userId)).size >= 3) flags.push("possible_coordinated_submissions");
  if (input.confirmedCause && input.outcome === "persisted") flags.push("cause_not_confirmed_by_outcome");
  if (!input.confirmedCause) flags.push("unresolved_cause");
  if (input.codes.length) {
    const verifiedSameCodes = await db
      .select({ cause: repairCases.confirmedCause })
      .from(repairCases)
      .where(and(eq(repairCases.status, "verified"), sql`${repairCases.codes} @> ${JSON.stringify(input.codes)}::jsonb`, sql`lower(${repairCases.vehicleSnapshot}->>'make') = lower(${String(snapshot.make ?? "")})`))
      .limit(20);
    const mine = searchKey(input.confirmedCause ?? "");
    if (mine && verifiedSameCodes.length && !verifiedSameCodes.some((v) => searchKey(v.cause ?? "") === mine)) flags.push("differs_from_verified_cases");
  }
  const [row] = await db
    .insert(repairCases)
    .values({
      userId,
      vehicleId: input.vehicleId ?? null,
      diagnosticSessionId: input.diagnosticSessionId ?? null,
      vehicleSnapshot: snapshot,
      codes: input.codes.map((c) => c.toUpperCase()),
      symptoms: input.symptoms,
      measurements: input.measurements,
      confirmedCause: input.confirmedCause ?? null,
      confirmedBy: input.confirmedBy,
      repairPerformed: input.repairPerformed ?? null,
      partsReplaced: input.partsReplaced,
      repairDate: input.repairDate ?? null,
      costMinor: input.costMinor ?? null,
      currency: input.currency ?? null,
      outcome: input.outcome,
      attachmentIds: input.attachmentIds,
      status: flags.some((f) => f.startsWith("possible_") || f.startsWith("duplicate")) ? "needs_review" : "submitted",
      fingerprint: fp,
      flags,
    })
    .returning();
  await audit({ action: "case.submitted", actorUserId: userId, targetKind: "repair_case", targetId: row!.id, requestId, meta: { flags } });
  return row!;
}

export async function listMyCases(userId: string) {
  const db = await getDb();
  return db.select().from(repairCases).where(eq(repairCases.userId, userId)).orderBy(desc(repairCases.createdAt)).limit(100);
}

export async function addOutcome(userId: string, caseId: string, outcome: "resolved" | "persisted" | "partially" | "unknown", notes?: string) {
  const db = await getDb();
  const [c] = await db.select({ id: repairCases.id }).from(repairCases).where(and(eq(repairCases.id, caseId), eq(repairCases.userId, userId))).limit(1);
  if (!c) throw new AppError("not_found");
  await db.insert(repairOutcomes).values({ caseId, outcome, notes });
  await db.update(repairCases).set({ outcome, updatedAt: new Date() }).where(eq(repairCases.id, caseId));
}

/** Reviewer queue: case content without the submitter's identity. */
export async function reviewQueue(reviewerId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(repairCases)
    .where(and(or(eq(repairCases.status, "submitted"), eq(repairCases.status, "needs_review")), ne(repairCases.userId, reviewerId)))
    .orderBy(repairCases.createdAt)
    .limit(50);
  return rows.map(({ userId: _u, vehicleId: _v, diagnosticSessionId: _d, attachmentIds, ...rest }) => ({ ...rest, attachmentCount: attachmentIds.length }));
}

export async function reviewCase(reviewerId: string, caseId: string, input: { decision: "verified" | "rejected" | "inconclusive" | "needs_review"; notes: string; evidence: string[] }, requestId?: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(repairCases).where(eq(repairCases.id, caseId)).for("update").limit(1);
    if (!c) throw new AppError("not_found");
    if (c.userId === reviewerId) throw new AppError("forbidden", "cannot_review_own_case");
    if (input.decision === "verified" && !c.confirmedCause) throw new AppError("conflict", "cannot_verify_without_confirmed_cause");
    await tx.insert(expertReviews).values({ caseId, reviewerId, decision: input.decision, notes: input.notes, evidence: input.evidence, guidelineVersion: REVIEW_GUIDELINE_VERSION });
    await tx.update(repairCases).set({ status: input.decision, updatedAt: new Date() }).where(eq(repairCases.id, caseId));
    if (input.decision === "verified") await promoteToLearning(tx, c);
    else await tx.delete(learningCaseCopies).where(eq(learningCaseCopies.sourceCaseId, caseId));
    await audit({ action: "case.reviewed", actorUserId: reviewerId, targetKind: "repair_case", targetId: caseId, requestId, meta: { decision: input.decision } }, tx);
  });
}

/**
 * Only verified cases from users with ACTIVE learning consent get a
 * de-identified copy, and only those copies feed the RAG corpus.
 */
async function promoteToLearning(tx: Tx, c: typeof repairCases.$inferSelect) {
  const consent = await activeConsent(c.userId, tx);
  if (!consent || !consent.sources.includes("repair_cases")) return;
  const payload = toLearningPayload(c);
  const [copy] = await tx
    .insert(learningCaseCopies)
    .values({ sourceCaseId: c.id, consentRecordId: consent.id, payload, groupKey: groupKeyFor(c) })
    .onConflictDoUpdate({ target: learningCaseCopies.sourceCaseId, set: { payload, status: "eligible", withdrawnAt: null } })
    .returning();
  const [src] = await tx
    .insert(sourceRecords)
    .values({ providerId: "internal_curated", externalRef: `learning_copy:${copy!.id}`, title: `Verified case ${String(payload.vehicle && (payload.vehicle as Record<string, unknown>).make)} ${c.codes.join(" ")}`.trim(), language: "ar", version: REVIEW_GUIDELINE_VERSION })
    .returning();
  const v = payload.vehicle as Record<string, unknown>;
  const body = [
    `Verified repair case. Vehicle: ${v.make} ${v.model} ${v.year} ${v.engine ?? ""}.`,
    `Codes: ${c.codes.join(", ") || "none"}.`,
    `Symptoms: ${payload.symptoms}`,
    `Confirmed cause: ${payload.confirmedCause}`,
    `Repair: ${payload.repairPerformed ?? "not stated"}. Outcome: ${payload.outcome}.`,
  ].join("\n");
  const [doc] = await tx
    .insert(knowledgeDocuments)
    .values({ sourceRecordId: src!.id, kind: "verified_case", title: `Verified case: ${c.codes.join(" ") || String(v.make)}`, language: "ar", body, make: String(v.make ?? "") || null, model: String(v.model ?? "") || null, yearFrom: Number(v.year) || null, yearTo: Number(v.year) || null, codes: c.codes, ragAllowed: true })
    .returning();
  const chunks = chunkText(body);
  if (chunks.length) await tx.insert(knowledgeChunks).values(chunks.map((content, i) => ({ documentId: doc!.id, chunkIndex: i, content, contentKey: searchKey(content) })));
}

// ---------------- datasets & models ----------------

function splitOf(groupKey: string, seed: string): "train" | "test" {
  const h = createHash("sha256").update(`${seed}:${groupKey}`).digest();
  return h[0]! < 51 ? "test" : "train"; // ~20% test
}

export async function buildDataset(adminId: string, name: string, requestId?: string) {
  const db = await getDb();
  const rows = await db
    .select({ id: learningCaseCopies.id, groupKey: learningCaseCopies.groupKey, textVersion: consentRecords.textVersion })
    .from(learningCaseCopies)
    .innerJoin(consentRecords, eq(consentRecords.id, learningCaseCopies.consentRecordId))
    .innerJoin(repairCases, eq(repairCases.id, learningCaseCopies.sourceCaseId))
    .where(and(eq(learningCaseCopies.status, "eligible"), isNull(consentRecords.withdrawnAt), eq(repairCases.status, "verified")));
  const seed = sha256Hex(`${name}:${Date.now()}`).slice(0, 16);
  const manifest = { train: [] as string[], test: [] as string[], consentTextVersions: [...new Set(rows.map((r) => r.textVersion))] };
  for (const r of rows) manifest[splitOf(r.groupKey, seed)].push(r.id);
  const [ds] = await db.insert(datasetVersions).values({ name, createdBy: adminId, splitSeed: seed, manifest, caseCount: rows.length }).returning();
  await audit({ action: "learning.dataset_created", actorUserId: adminId, targetKind: "dataset", targetId: ds!.id, requestId, meta: { cases: rows.length } });
  return ds!;
}

export async function approveDataset(adminId: string, datasetId: string, requestId?: string) {
  const db = await getDb();
  const [ds] = await db.update(datasetVersions).set({ status: "approved", approvedBy: adminId, approvedAt: new Date() }).where(and(eq(datasetVersions.id, datasetId), eq(datasetVersions.status, "draft"))).returning();
  if (!ds) throw new AppError("not_found");
  await audit({ action: "learning.dataset_approved", actorUserId: adminId, targetKind: "dataset", targetId: datasetId, requestId });
  return ds;
}

/** JSONL export of an approved dataset. Copies withdrawn since approval are skipped. */
export async function exportDataset(datasetId: string): Promise<string> {
  const db = await getDb();
  const [ds] = await db.select().from(datasetVersions).where(eq(datasetVersions.id, datasetId)).limit(1);
  if (!ds || (ds.status !== "approved" && ds.status !== "used_in_training")) throw new AppError("conflict", "dataset_not_approved");
  const ids = [...ds.manifest.train, ...ds.manifest.test];
  const copies = ids.length ? await db.select().from(learningCaseCopies).where(and(inArray(learningCaseCopies.id, ids), eq(learningCaseCopies.status, "eligible"))) : [];
  const byId = new Map(copies.map((c) => [c.id, c]));
  const lines: string[] = [];
  for (const split of ["train", "test"] as const) {
    for (const id of ds.manifest[split]) {
      const c = byId.get(id);
      if (c) lines.push(JSON.stringify({ split, group: sha256Hex(c.groupKey).slice(0, 12), ...c.payload }));
    }
  }
  return lines.join("\n");
}

export async function listDatasets() {
  const db = await getDb();
  return db.select().from(datasetVersions).orderBy(desc(datasetVersions.createdAt)).limit(50);
}

export async function registerModel(adminId: string, input: { name: string; baseModel: string; license: string; adapterRef?: string; datasetVersionId?: string; notes?: string }, requestId?: string) {
  const db = await getDb();
  const [m] = await db.insert(modelVersions).values({ ...input }).returning();
  await audit({ action: "learning.model_registered", actorUserId: adminId, targetKind: "model", targetId: m!.id, requestId, meta: { name: input.name } });
  return m!;
}

/** Approve/activate/retire. Activation needs an evaluation run and leaves the previous active model as rollback target. */
export async function setModelStatus(adminId: string, modelId: string, status: "approved" | "active" | "retired", requestId?: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(modelVersions).where(eq(modelVersions.id, modelId)).limit(1);
    if (!m) throw new AppError("not_found");
    if (status === "active") {
      if (m.status !== "approved" && m.status !== "retired") throw new AppError("conflict", "model_must_be_approved");
      const [run] = await tx.select({ id: evaluationRuns.id }).from(evaluationRuns).where(eq(evaluationRuns.modelName, m.name)).limit(1);
      if (!run) throw new AppError("conflict", "evaluation_required");
      await tx.update(modelVersions).set({ status: "approved" }).where(eq(modelVersions.status, "active"));
    }
    await tx.update(modelVersions).set({ status, ...(status === "approved" ? { approvedBy: adminId, approvedAt: new Date() } : {}) }).where(eq(modelVersions.id, modelId));
    await audit({ action: "learning.model_status", actorUserId: adminId, targetKind: "model", targetId: modelId, requestId, meta: { status } }, tx);
  });
}

export async function listModels() {
  const db = await getDb();
  return db.select().from(modelVersions).orderBy(desc(modelVersions.createdAt));
}

export async function listEvaluationRuns() {
  const db = await getDb();
  return db.select().from(evaluationRuns).orderBy(desc(evaluationRuns.createdAt)).limit(50);
}
