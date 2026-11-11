import "server-only";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { extractDtcs, parseDtc, type CheckResultInput, type DiagnosticContextInput, type WarningLight } from "@autocare/contracts";
import type { z } from "zod";
import { env } from "../../config/env";
import { getDb } from "../../db/client";
import { diagnosticObservations, diagnosticRecommendations, diagnosticSessions, reportShares, workshopMembers } from "../../db/schema";
import { randomToken, sha256Hex } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { audit } from "../audit/audit";
import { assertDailyQuota, recordUsage, withInferenceSlot } from "../ai/gate";
import { assertAiAllowance } from "../billing/service";
import { chatJson } from "../ai/ollama";
import { buildMessages, DIAGNOSIS_JSON_SCHEMA, PROMPT_VERSION, validateModelOutput, type ValidatedDiagnosis } from "../ai/prompt";
import { retrieve } from "../ai/rag";
import { lookupDtc, type DtcLookupResult } from "../knowledge/dtc-service";
import { getOwnedVehicle, vehicleSnapshot } from "../vehicles/service";
import { evaluateRules, type RulesResult } from "./rules";

type Session = typeof diagnosticSessions.$inferSelect;

async function ownedSession(userId: string, id: string): Promise<Session> {
  const db = await getDb();
  const [s] = await db.select().from(diagnosticSessions).where(and(eq(diagnosticSessions.id, id), eq(diagnosticSessions.userId, userId))).limit(1);
  if (!s) throw new AppError("not_found");
  return s;
}

export async function startSession(userId: string, input: { vehicleId: string; codes: string[]; symptoms: string }) {
  await getOwnedVehicle(userId, input.vehicleId);
  const parsed = [...input.codes.map((c) => parseDtc(c)), ...extractDtcs(input.symptoms)]
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .filter((p, i, arr) => arr.findIndex((x) => x.code === p.code && x.failureType === p.failureType) === i)
    .slice(0, 20);
  const unrecognised = input.codes.filter((c) => !parseDtc(c));
  const db = await getDb();
  const [s] = await db
    .insert(diagnosticSessions)
    .values({
      userId,
      vehicleId: input.vehicleId,
      codes: parsed.map((p) => ({ raw: p.raw, code: p.code, format: p.format, scope: p.scope, failureType: p.failureType })),
      symptoms: input.symptoms,
      step: "context",
    })
    .returning();
  await db.insert(diagnosticObservations).values({ sessionId: s!.id, kind: "code", payload: { codes: parsed.map((p) => p.raw), unrecognised } });
  return { session: s!, unrecognised };
}

export async function updateContext(userId: string, sessionId: string, ctx: z.output<typeof DiagnosticContextInput>) {
  const s = await ownedSession(userId, sessionId);
  const db = await getDb();
  const related = (ctx.relatedCodes ?? []).map((c) => parseDtc(c)).filter((p): p is NonNullable<typeof p> => p !== null);
  const codes = [...s.codes];
  for (const p of related) if (!codes.some((c) => c.code === p.code)) codes.push({ raw: p.raw, code: p.code, format: p.format, scope: p.scope, failureType: p.failureType });
  const [row] = await db
    .update(diagnosticSessions)
    .set({ context: { ...s.context, ...ctx }, codes: codes.slice(0, 20), step: "checks", updatedAt: new Date() })
    .where(and(eq(diagnosticSessions.id, sessionId), eq(diagnosticSessions.userId, userId)))
    .returning();
  await db.insert(diagnosticObservations).values({ sessionId, kind: "context", payload: ctx as Record<string, unknown> });
  return row!;
}

export async function recordCheck(userId: string, sessionId: string, input: z.output<typeof CheckResultInput>) {
  await ownedSession(userId, sessionId);
  const db = await getDb();
  await db.insert(diagnosticObservations).values({ sessionId, kind: "check_result", payload: input as Record<string, unknown> });
  await db.update(diagnosticSessions).set({ status: "awaiting_checks", updatedAt: new Date() }).where(eq(diagnosticSessions.id, sessionId));
}

async function checkResultsOf(sessionId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(diagnosticObservations)
    .where(and(eq(diagnosticObservations.sessionId, sessionId), eq(diagnosticObservations.kind, "check_result")))
    .orderBy(diagnosticObservations.createdAt);
  // Latest answer per check wins.
  const map = new Map<string, { checkId: string; result: "pass" | "fail" | "not_done" | "unsure"; note?: string; value?: string }>();
  for (const r of rows) {
    const p = r.payload as { checkId: string; result: "pass" | "fail" | "not_done" | "unsure"; note?: string; value?: string };
    map.set(p.checkId, p);
  }
  return [...map.values()];
}

export type ModelStatus = "ok" | "disabled" | "unavailable" | "timeout" | "invalid_output" | "busy" | "skipped_safety" | "skipped_no_coverage";

export interface DiagnosisView {
  rules: RulesResult;
  model: ValidatedDiagnosis | null;
  modelStatus: ModelStatus;
  modelStatusDetail: string | null;
  sources: Array<{ ref: string; title: string; kind: string; sourceRecordId: string }>;
  lookups: DtcLookupResult[];
  generatedAt: string;
  rulesVersion: string;
  modelName: string | null;
  promptVersion: string | null;
}

/**
 * Produce the structured result. The rules layer always runs; the model only
 * adds an explanation grounded in retrieved sources. If the model is off,
 * busy, times out or returns invalid JSON, the documented (rules + knowledge
 * base) result is still returned together with the reason.
 */
export async function generateRecommendation(userId: string, sessionId: string, locale: "ar" | "en", signal?: AbortSignal, requestId?: string): Promise<DiagnosisView> {
  const s = await ownedSession(userId, sessionId);
  const vehicle = await getOwnedVehicle(userId, s.vehicleId);
  const vctx = { make: vehicle.make, model: vehicle.model, year: vehicle.year, engine: vehicle.engine, market: vehicle.salesMarket };
  const lookups = (await Promise.all(s.codes.map((c) => lookupDtc(c.failureType ? `${c.code}-${c.failureType}` : c.code, vctx)))).filter((x): x is DtcLookupResult => x !== null);
  const checks = await checkResultsOf(sessionId);
  const ctx = s.context as { warningLights?: WarningLight[]; onset?: string };
  const rules = evaluateRules({
    lookups,
    symptoms: s.symptoms,
    warningLights: ctx.warningLights ?? [],
    checkResults: checks,
    hasOnset: Boolean(ctx.onset && ctx.onset !== "unknown"),
    fuel: vehicle.fuel,
  });

  let model: ValidatedDiagnosis | null = null;
  let modelStatus: ModelStatus = "disabled";
  let modelStatusDetail: string | null = null;
  let sources: DiagnosisView["sources"] = [];
  const started = Date.now();
  let usage: { promptTokens?: number; outputTokens?: number } = {};

  if (env().AI_MODE === "disabled") {
    modelStatus = "disabled";
  } else if (rules.suppressDiy) {
    // Safety-critical areas: no generated procedures, only reviewed referral text.
    modelStatus = "skipped_safety";
  } else if (s.codes.length > 0 && !lookups.some((l) => l.status === "covered")) {
    // Codes given but none covered by our sources: the model would only guess (measured in
    // eval: it invents causes for uncovered manufacturer codes). Show insufficient evidence instead.
    modelStatus = "skipped_no_coverage";
  } else {
    try {
      await assertDailyQuota(userId);
      await assertAiAllowance(userId);
      const coveredCodes = lookups.filter((l) => l.status === "covered").map((l) => l.parsed.code);
      const { chunks } = await retrieve({ codes: s.codes.map((c) => c.code), symptoms: s.symptoms, make: vehicle.make, year: vehicle.year, restrictToCodes: coveredCodes.length ? coveredCodes : undefined });
      const refs = chunks.map((chunk, i) => ({ ref: `S${i + 1}`, chunk }));
      sources = refs.map((r) => ({ ref: r.ref, title: r.chunk.title, kind: r.chunk.kind, sourceRecordId: r.chunk.sourceRecordId }));
      const messages = buildMessages({
        locale,
        vehicle: { ...vehicleSnapshot(vehicle), engine: vehicle.engine, market: vehicle.salesMarket },
        codes: s.codes.map((c) => ({ code: c.code, raw: c.raw, status: lookups.find((l) => l.parsed.code === c.code)?.status ?? "not_covered" })),
        symptoms: s.symptoms,
        context: { onset: ctx.onset, conditions: (s.context as Record<string, unknown>).conditions, recentMaintenance: (s.context as Record<string, unknown>).recentMaintenance },
        checkResults: checks,
        rules,
        sources: refs,
      });
      const out = await withInferenceSlot(() => chatJson(env().AI_MODEL, messages, DIAGNOSIS_JSON_SCHEMA, signal), signal);
      usage = { promptTokens: out.promptTokens, outputTokens: out.outputTokens };
      model = validateModelOutput(out.content, new Set(refs.map((r) => r.ref)));
      modelStatus = model ? "ok" : "invalid_output";
      if (model && refs.length === 0) model.insufficientEvidence = true;
    } catch (e) {
      const err = e as AppError;
      modelStatus = err.code === "ai_busy" ? "busy" : err.message === "timeout" ? "timeout" : "unavailable";
      modelStatusDetail = err.code === "rate_limited" ? "daily_quota" : err.code === "plan_limit" ? "plan_allowance" : err.message ?? null;
      logger.warn({ sessionId, code: err.code, msg: err.message }, "model step failed; returning rules-only result");
    }
    await recordUsage({ userId, kind: "diagnosis", model: env().AI_MODEL, status: modelStatus, promptTokens: usage.promptTokens, outputTokens: usage.outputTokens, latencyMs: Date.now() - started });
  }

  const db = await getDb();
  await db.insert(diagnosticRecommendations).values({
    sessionId,
    rulesResult: rules as unknown as Record<string, unknown>,
    modelResult: model as unknown as Record<string, unknown> | null,
    urgency: rules.urgency,
    rulesVersion: rules.version,
    modelName: modelStatus === "ok" || modelStatus === "invalid_output" ? env().AI_MODEL : null,
    promptVersion: modelStatus === "ok" || modelStatus === "invalid_output" ? PROMPT_VERSION : null,
    modelStatus,
    sourceIds: [...new Set([...sources.map((x) => x.sourceRecordId), ...lookups.flatMap((l) => l.definitions.map((d) => d.source.id))])],
    latencyMs: Date.now() - started,
  });
  await db.update(diagnosticSessions).set({ step: "result", status: "completed", updatedAt: new Date() }).where(eq(diagnosticSessions.id, sessionId));
  await audit({ action: "diagnosis.generated", actorUserId: userId, targetKind: "diagnostic_session", targetId: sessionId, requestId, meta: { urgency: rules.urgency, modelStatus, rules: rules.version } });

  return {
    rules,
    model,
    modelStatus,
    modelStatusDetail,
    sources,
    lookups,
    generatedAt: new Date().toISOString(),
    rulesVersion: rules.version,
    modelName: modelStatus === "ok" ? env().AI_MODEL : null,
    promptVersion: modelStatus === "ok" ? PROMPT_VERSION : null,
  };
}

/** Rules-only evaluation (no model, nothing stored) used to show ordered checks during the session. */
export async function previewRules(userId: string, sessionId: string) {
  const s = await ownedSession(userId, sessionId);
  const vehicle = await getOwnedVehicle(userId, s.vehicleId);
  const vctx = { make: vehicle.make, model: vehicle.model, year: vehicle.year, engine: vehicle.engine, market: vehicle.salesMarket };
  const lookups = (await Promise.all(s.codes.map((c) => lookupDtc(c.failureType ? `${c.code}-${c.failureType}` : c.code, vctx)))).filter((x): x is DtcLookupResult => x !== null);
  const ctx = s.context as { warningLights?: WarningLight[]; onset?: string };
  return evaluateRules({ lookups, symptoms: s.symptoms, warningLights: ctx.warningLights ?? [], checkResults: await checkResultsOf(sessionId), hasOnset: Boolean(ctx.onset && ctx.onset !== "unknown"), fuel: vehicle.fuel });
}

export async function getSessionDetail(userId: string, sessionId: string) {
  const s = await ownedSession(userId, sessionId);
  return sessionDetail(s);
}

async function sessionDetail(s: Session) {
  const db = await getDb();
  const [rec] = await db.select().from(diagnosticRecommendations).where(eq(diagnosticRecommendations.sessionId, s.id)).orderBy(desc(diagnosticRecommendations.createdAt)).limit(1);
  const checks = await checkResultsOf(s.id);
  return { session: s, latest: rec ?? null, checks };
}

export async function listSessions(userId: string) {
  const db = await getDb();
  return db.select().from(diagnosticSessions).where(eq(diagnosticSessions.userId, userId)).orderBy(desc(diagnosticSessions.updatedAt)).limit(50);
}

// ---------------- sharing ----------------

export async function createShare(userId: string, sessionId: string, ttlHours: number, workshopId: string | undefined, requestId?: string) {
  await ownedSession(userId, sessionId);
  const db = await getDb();
  const token = randomToken(24);
  const [row] = await db
    .insert(reportShares)
    .values({ sessionId, createdBy: userId, tokenHash: sha256Hex(token), workshopId: workshopId ?? null, expiresAt: new Date(Date.now() + ttlHours * 3_600_000) })
    .returning();
  await audit({ action: "report.shared", actorUserId: userId, targetKind: "diagnostic_session", targetId: sessionId, requestId, meta: { ttlHours, workshop: Boolean(workshopId) } });
  return { id: row!.id, token, url: `${env().APP_ORIGIN}/r/${token}`, expiresAt: row!.expiresAt };
}

export async function listShares(userId: string, sessionId: string) {
  await ownedSession(userId, sessionId);
  const db = await getDb();
  return db
    .select({ id: reportShares.id, expiresAt: reportShares.expiresAt, revokedAt: reportShares.revokedAt, accessCount: reportShares.accessCount, workshopId: reportShares.workshopId, createdAt: reportShares.createdAt })
    .from(reportShares)
    .where(eq(reportShares.sessionId, sessionId));
}

export async function revokeShare(userId: string, shareId: string, requestId?: string) {
  const db = await getDb();
  const rows = await db
    .update(reportShares)
    .set({ revokedAt: new Date() })
    .where(and(eq(reportShares.id, shareId), eq(reportShares.createdBy, userId), isNull(reportShares.revokedAt)))
    .returning({ id: reportShares.id, sessionId: reportShares.sessionId });
  if (!rows[0]) throw new AppError("not_found");
  await audit({ action: "report.share_revoked", actorUserId: userId, targetKind: "report_share", targetId: shareId, requestId });
}

/**
 * Resolve a share token. Workshop-restricted shares additionally require the
 * viewer to be a member of that workshop. Returns a report-only view: no VIN,
 * no owner contact details, no other sessions.
 */
export async function openShare(token: string, viewerUserId: string | null) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new AppError("not_found");
  const db = await getDb();
  const [share] = await db
    .select()
    .from(reportShares)
    .where(and(eq(reportShares.tokenHash, sha256Hex(token)), isNull(reportShares.revokedAt), gt(reportShares.expiresAt, new Date())))
    .limit(1);
  if (!share) throw new AppError("not_found");
  if (share.workshopId) {
    if (!viewerUserId) throw new AppError("unauthenticated");
    const [m] = await db.select().from(workshopMembers).where(and(eq(workshopMembers.workshopId, share.workshopId), eq(workshopMembers.userId, viewerUserId))).limit(1);
    if (!m) throw new AppError("not_found");
  }
  await db.update(reportShares).set({ accessCount: share.accessCount + 1, lastAccessAt: new Date() }).where(eq(reportShares.id, share.id));
  await audit({ action: "report.share_accessed", actorUserId: viewerUserId, targetKind: "report_share", targetId: share.id });
  const [s] = await db.select().from(diagnosticSessions).where(eq(diagnosticSessions.id, share.sessionId)).limit(1);
  if (!s) throw new AppError("not_found");
  const detail = await sessionDetail(s);
  const vehicleRow = await getOwnedVehicle(s.userId, s.vehicleId).catch(() => null);
  return {
    expiresAt: share.expiresAt,
    vehicle: vehicleRow ? vehicleSnapshot(vehicleRow) : null,
    codes: s.codes,
    symptoms: s.symptoms,
    latest: detail.latest,
    checks: detail.checks,
  };
}
