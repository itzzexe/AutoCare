/**
 * Application errors with stable codes. Only `code` + a safe message ever
 * reach the client; internal details stay in the server log.
 */
export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "csrf_failed"
  | "rate_limited"
  | "payload_too_large"
  | "unsupported_media_type"
  | "reauth_required"
  | "mfa_required"
  | "provider_not_configured"
  | "provider_unavailable"
  | "ai_unavailable"
  | "ai_busy"
  | "insufficient_stock"
  | "price_changed"
  | "plan_limit"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  csrf_failed: 403,
  rate_limited: 429,
  plan_limit: 402,
  payload_too_large: 413,
  unsupported_media_type: 415,
  reauth_required: 403,
  mfa_required: 403,
  provider_not_configured: 503,
  provider_unavailable: 503,
  ai_unavailable: 503,
  ai_busy: 503,
  insufficient_stock: 409,
  price_changed: 409,
  internal: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly extra?: { fields?: Record<string, string[]>; retryAfterSeconds?: number },
  ) {
    super(message ?? code);
    this.status = STATUS[code];
  }
}

export const notFound = () => new AppError("not_found");
export const forbidden = () => new AppError("forbidden");
