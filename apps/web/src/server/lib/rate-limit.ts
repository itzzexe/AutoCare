import "server-only";
import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes, type RateLimiterAbstract } from "rate-limiter-flexible";
import { env } from "../config/env";
import { AppError } from "./errors";
import { logger } from "./logger";

/**
 * Rate limiting (rate-limiter-flexible). Redis-backed whenever REDIS_URL is
 * set (required in production so limits are shared across instances); an
 * in-process memory store is used only in development/tests.
 *
 * Failure policy when Redis is unreachable:
 *   - "closed" policies (login, reset, AI, upload, orders): request is refused (503)
 *   - "open" policies (search, general reads/writes): fall back to a per-instance memory limiter
 */

type Policy = { points: number; duration: number; blockDuration?: number; failure: "open" | "closed" };

export const POLICIES = {
  "login:ip": { points: 20, duration: 15 * 60, failure: "closed" },
  "login:account": { points: 6, duration: 15 * 60, blockDuration: 15 * 60, failure: "closed" },
  "register:ip": { points: 6, duration: 60 * 60, failure: "closed" },
  "reset:ip": { points: 6, duration: 60 * 60, failure: "closed" },
  "reset:account": { points: 3, duration: 60 * 60, failure: "closed" },
  "verify:ip": { points: 20, duration: 60 * 60, failure: "closed" },
  "mfa:user": { points: 8, duration: 15 * 60, blockDuration: 15 * 60, failure: "closed" },
  "search:ip": { points: 60, duration: 60, failure: "open" },
  "search:user": { points: 120, duration: 60, failure: "open" },
  "vin:user": { points: 20, duration: 60 * 60, failure: "closed" },
  "ai:user": { points: 6, duration: 10 * 60, failure: "closed" },
  "upload:user": { points: 20, duration: 60 * 60, failure: "closed" },
  "offer_request:user": { points: 10, duration: 60 * 60, failure: "closed" },
  "order:user": { points: 10, duration: 10 * 60, failure: "closed" },
  "write:user": { points: 120, duration: 60, failure: "open" },
  "share:ip": { points: 60, duration: 60, failure: "open" },
  "webhook:ip": { points: 120, duration: 60, failure: "closed" },
} satisfies Record<string, Policy>;
export type PolicyName = keyof typeof POLICIES;

type G = { __acqLimiters?: Map<string, RateLimiterAbstract>; __acqRedis?: Promise<unknown> };
const g = globalThis as G;
const limiters: Map<string, RateLimiterAbstract> = (g.__acqLimiters ??= new Map());

/**
 * Shared Redis client. The offline queue is disabled (commands fail fast
 * instead of piling up while Redis is down), so we must wait for the first
 * connection before handing the client to the limiter — otherwise the very
 * first requests after start-up would hit the fail-closed path.
 */
async function redisClient() {
  if (!env().REDIS_URL) return null;
  g.__acqRedis ??= (async () => {
    const { Redis } = await import("ioredis");
    const client = new Redis(env().REDIS_URL!, { enableOfflineQueue: false, maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 5_000 });
    client.on("error", (e: Error) => logger.warn({ err: e.message }, "redis error"));
    try {
      await client.connect();
    } catch (e) {
      g.__acqRedis = undefined; // retry on the next request
      throw e;
    }
    return client;
  })();
  return g.__acqRedis;
}

async function limiterFor(name: PolicyName): Promise<RateLimiterAbstract> {
  const existing = limiters.get(name);
  if (existing) return existing;
  const p: Policy = POLICIES[name];
  const base = { keyPrefix: `rl:${name}`, points: p.points, duration: p.duration, blockDuration: p.blockDuration ?? 0 };
  let redis: unknown = null;
  try {
    redis = await redisClient();
  } catch (e) {
    logger.error({ policy: name, err: (e as Error).message }, "redis unavailable for rate limiting");
    if (p.failure === "closed") throw new AppError("rate_limited", "limiter_unavailable", { retryAfterSeconds: 30 });
    // Open policy: degrade to a per-instance limiter for this request only (not cached).
    return new RateLimiterMemory(base);
  }
  let limiter: RateLimiterAbstract;
  if (redis) {
    limiter = new RateLimiterRedis({
      ...base,
      storeClient: redis,
      insuranceLimiter: p.failure === "open" ? new RateLimiterMemory(base) : undefined,
    });
  } else {
    limiter = new RateLimiterMemory(base);
  }
  limiters.set(name, limiter);
  return limiter;
}

/** Consume one point; throws AppError("rate_limited") with Retry-After seconds. */
export async function rateLimit(name: PolicyName, key: string, points = 1): Promise<void> {
  const limiter = await limiterFor(name);
  try {
    await limiter.consume(key, points);
  } catch (e) {
    if (e instanceof RateLimiterRes) {
      throw new AppError("rate_limited", undefined, { retryAfterSeconds: Math.max(1, Math.ceil(e.msBeforeNext / 1000)) });
    }
    logger.error({ policy: name, err: (e as Error).message }, "rate limiter store failure");
    // Closed policy: refuse rather than allow an unlimited sensitive operation.
    throw new AppError("rate_limited", "limiter_unavailable", { retryAfterSeconds: 30 });
  }
}

/** Reset a key after success (e.g. account login counter after a good login). */
export async function rateLimitReset(name: PolicyName, key: string): Promise<void> {
  const limiter = await limiterFor(name);
  await limiter.delete(key).catch(() => undefined);
}

export function resetLimitersForTests(): void {
  limiters.clear();
  g.__acqRedis = undefined;
}
