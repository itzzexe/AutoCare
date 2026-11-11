import "server-only";
import { and, count, eq, gt } from "drizzle-orm";
import { env } from "../../config/env";
import { getDb } from "../../db/client";
import { aiUsage } from "../../db/schema";
import { AppError } from "../../lib/errors";

/**
 * In-process admission control for inference: a semaphore with a bounded
 * queue (AI_MAX_CONCURRENCY / AI_MAX_QUEUE) plus a per-user daily quota.
 * When several web instances share one runtime, Ollama's own
 * OLLAMA_NUM_PARALLEL / OLLAMA_MAX_QUEUE (503 when full) is the global bound.
 */
type Waiter = { resolve: () => void; reject: (e: unknown) => void };
const g = globalThis as { __acqAiGate?: { active: number; queue: Waiter[] } };
const state = (g.__acqAiGate ??= { active: 0, queue: [] });

export function gateStats() {
  return { active: state.active, queued: state.queue.length, maxConcurrency: env().AI_MAX_CONCURRENCY, maxQueue: env().AI_MAX_QUEUE };
}

export async function withInferenceSlot<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (state.active >= env().AI_MAX_CONCURRENCY) {
    if (state.queue.length >= env().AI_MAX_QUEUE) throw new AppError("ai_busy", "queue_full", { retryAfterSeconds: 20 });
    await new Promise<void>((resolve, reject) => {
      const w: Waiter = { resolve, reject };
      state.queue.push(w);
      signal?.addEventListener(
        "abort",
        () => {
          const i = state.queue.indexOf(w);
          if (i >= 0) state.queue.splice(i, 1);
          reject(new AppError("ai_unavailable", "cancelled"));
        },
        { once: true },
      );
    });
  } else {
    state.active++;
  }
  try {
    return await fn();
  } finally {
    const next = state.queue.shift();
    if (next) next.resolve();
    else state.active--;
  }
}

export async function assertDailyQuota(userId: string): Promise<void> {
  const db = await getDb();
  const since = new Date(Date.now() - 24 * 3_600_000);
  const [row] = await db
    .select({ n: count() })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.kind, "diagnosis"), gt(aiUsage.createdAt, since)));
  if ((row?.n ?? 0) >= env().AI_DAILY_QUOTA_PER_USER) throw new AppError("rate_limited", "ai_daily_quota", { retryAfterSeconds: 3600 });
}

export async function recordUsage(entry: typeof aiUsage.$inferInsert): Promise<void> {
  const db = await getDb();
  await db.insert(aiUsage).values(entry);
}
