import "server-only";
import { getDb, type Tx } from "../../db/client";
import { auditEvents } from "../../db/schema";
import { logger, scrub } from "../../lib/logger";

export type AuditAction =
  | "subscription.requested" | "subscription.manual_confirmed" | "subscription.manual_rejected" | "subscription.amount_mismatch" | "subscription.paid"
  | "plan.updated" | "payment.gateway_return" | "payment.gateway_webhook" | "payment.amount_mismatch" | "commission.status_changed"
  | "auth.register" | "auth.login" | "auth.login_failed" | "auth.logout" | "auth.password_changed"
  | "auth.password_reset_requested" | "auth.password_reset" | "auth.email_verified"
  | "auth.mfa_enabled" | "auth.mfa_disabled" | "auth.session_revoked" | "auth.reauth"
  | "rbac.role_granted" | "rbac.role_revoked"
  | "admin.user_viewed" | "admin.audit_viewed" | "admin.outbox_viewed"
  | "vehicle.vin_decoded" | "vehicle.deleted"
  | "knowledge.dtc_changed" | "knowledge.coverage_changed" | "provider.status_changed" | "provider.license_recorded"
  | "diagnosis.generated" | "report.shared" | "report.share_revoked" | "report.share_accessed"
  | "case.submitted" | "case.reviewed" | "consent.granted" | "consent.withdrawn"
  | "learning.dataset_created" | "learning.dataset_approved" | "learning.model_registered" | "learning.model_status"
  | "merchant.applied" | "merchant.status_changed" | "product.authenticity_verified" | "product.changed"
  | "order.placed" | "order.status_changed" | "payment.webhook" | "return.requested"
  | "workshop.applied" | "workshop.status_changed" | "appointment.status_changed"
  | "review.moderated" | "upload.rejected" | "account.export" | "account.deleted";

export interface AuditInput {
  action: AuditAction;
  actorUserId?: string | null;
  targetKind?: string;
  targetId?: string;
  requestId?: string;
  ipPrefix?: string | null;
  meta?: Record<string, unknown>;
}

function redactMeta(meta: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (/password|token|secret|vin|phone|address|key/i.test(k)) continue;
    out[k] = typeof v === "string" ? scrub(v).slice(0, 500) : v;
  }
  return out;
}

/** Write an audit event. Pass `tx` to make it atomic with the audited change. */
export async function audit(input: AuditInput, tx?: Tx): Promise<void> {
  const row = {
    action: input.action,
    actorUserId: input.actorUserId ?? null,
    targetKind: input.targetKind,
    targetId: input.targetId,
    requestId: input.requestId,
    ipPrefix: input.ipPrefix ?? null,
    meta: redactMeta(input.meta),
  };
  try {
    const db = tx ?? (await getDb());
    await db.insert(auditEvents).values(row);
  } catch (err) {
    // If the audit insert is part of a transaction, let the caller's tx fail.
    if (tx) throw err;
    logger.error({ err: (err as Error).message, action: input.action }, "audit write failed");
  }
}
