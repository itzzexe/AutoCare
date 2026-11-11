"use client";

/**
 * Browser API client for /api/v1. Sends the CSRF token on unsafe methods,
 * refreshes it once on csrf_failed, and surfaces typed error codes. No auth
 * token is ever stored in localStorage: the session lives in an HttpOnly cookie.
 */

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly fields?: Record<string, string[]>,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;

function readCsrfCookie(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)(?:__Host-)?acq_csrf=([^;]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

async function ensureCsrf(force = false): Promise<string> {
  if (!force) {
    csrfToken ??= readCsrfCookie();
    if (csrfToken) return csrfToken;
  }
  const res = await fetch("/api/v1/auth/csrf", { credentials: "same-origin", cache: "no-store" });
  const j = (await res.json()) as { csrfToken: string };
  csrfToken = j.csrfToken;
  return csrfToken;
}

export function setCsrfToken(t: string | undefined | null) {
  if (t) csrfToken = t;
}

type Opts = { method?: string; body?: unknown; headers?: Record<string, string>; raw?: Blob | ArrayBuffer; signal?: AbortSignal };

export async function api<T = unknown>(path: string, opts: Opts = {}, retried = false): Promise<T> {
  const method = (opts.method ?? (opts.body !== undefined || opts.raw ? "POST" : "GET")).toUpperCase();
  const headers: Record<string, string> = { accept: "application/json", ...(opts.headers ?? {}) };
  if (method !== "GET") headers["x-csrf-token"] = await ensureCsrf();
  let body: BodyInit | undefined;
  if (opts.raw) {
    body = opts.raw;
    headers["content-type"] = "application/octet-stream";
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { method, headers, body, credentials: "same-origin", cache: "no-store", signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("network", 0, "network");
  }
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const err = (json.error ?? {}) as { code?: string; message?: string; fields?: Record<string, string[]>; retryAfterSeconds?: number };
    if (err.code === "csrf_failed" && !retried) {
      await ensureCsrf(true);
      return api<T>(path, opts, true);
    }
    throw new ApiError(err.code ?? "internal", res.status, err.message ?? "error", err.fields, err.retryAfterSeconds);
  }
  if (typeof json.csrfToken === "string") csrfToken = json.csrfToken;
  return json as T;
}

export function newIdempotencyKey(): string {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
