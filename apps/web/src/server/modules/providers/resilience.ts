import "server-only";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";

/**
 * Outbound call protection for data providers:
 *  - per-attempt timeout (AbortSignal)
 *  - bounded retries with exponential backoff + full jitter, only for
 *    network errors and 5xx; 429 is NOT retried in-request (we honour the
 *    provider's limit and surface "provider_unavailable" with Retry-After)
 *  - circuit breaker: after N consecutive failures, calls short-circuit for a
 *    cooldown period instead of hammering a degraded provider
 */

interface BreakerState {
  failures: number;
  openUntil: number;
}
const g = globalThis as { __acqBreakers?: Map<string, BreakerState> };
const breakers: Map<string, BreakerState> = (g.__acqBreakers ??= new Map());

export interface CallOptions {
  provider: string;
  timeoutMs?: number;
  retries?: number;
  failureThreshold?: number;
  cooldownMs?: number;
}

export class ProviderHttpError extends Error {
  constructor(readonly status: number, readonly retryAfter?: number) {
    super(`provider http ${status}`);
  }
}

export function breakerStatus(provider: string): "closed" | "open" {
  const b = breakers.get(provider);
  return b && b.openUntil > Date.now() ? "open" : "closed";
}

export function resetBreakers(): void {
  breakers.clear();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function resilientCall<T>(opts: CallOptions, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const { provider, timeoutMs = 8_000, retries = 2, failureThreshold = 5, cooldownMs = 60_000 } = opts;
  const b = breakers.get(provider) ?? { failures: 0, openUntil: 0 };
  breakers.set(provider, b);
  if (b.openUntil > Date.now()) throw new AppError("provider_unavailable", "circuit_open", { retryAfterSeconds: Math.ceil((b.openUntil - Date.now()) / 1000) });

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const out = await fn(controller.signal);
      b.failures = 0;
      return out;
    } catch (err) {
      lastErr = err;
      if (err instanceof ProviderHttpError && err.status === 429) {
        throw new AppError("provider_unavailable", "provider_rate_limited", { retryAfterSeconds: err.retryAfter ?? 60 });
      }
      const retryable = !(err instanceof ProviderHttpError) || err.status >= 500;
      if (!retryable) break;
      if (attempt < retries) await sleep(Math.random() * Math.min(4_000, 250 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  b.failures += 1;
  if (b.failures >= failureThreshold) {
    b.openUntil = Date.now() + cooldownMs;
    logger.warn({ provider }, "provider circuit opened");
  }
  if (lastErr instanceof AppError) throw lastErr;
  if (lastErr instanceof ProviderHttpError && lastErr.status < 500) throw lastErr;
  throw new AppError("provider_unavailable", "provider_call_failed");
}

/** fetch() that throws ProviderHttpError on non-2xx and never follows redirects off-host. */
export async function providerFetch(url: string, init: RequestInit & { signal: AbortSignal }): Promise<Response> {
  const res = await fetch(url, { ...init, redirect: "error", cache: "no-store" });
  if (!res.ok) {
    const ra = Number(res.headers.get("retry-after"));
    throw new ProviderHttpError(res.status, Number.isFinite(ra) && ra > 0 ? ra : undefined);
  }
  return res;
}
