import { z, type ZodType } from "zod";
import * as C from "@autocare/contracts";

/**
 * OpenAPI 3.1 document for /api/v1, generated from the same zod schemas the
 * handlers validate with (single source of truth, shareable with mobile).
 */
type Auth = "none" | "optional" | "session";
interface Op {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  tag: string;
  summary: string;
  auth: Auth;
  body?: ZodType;
  query?: ZodType;
  notes?: string;
}

const ops: Op[] = [
  { method: "get", path: "/health", tag: "ops", summary: "Liveness", auth: "none" },
  { method: "get", path: "/ready", tag: "ops", summary: "Readiness (DB; AI state reported)", auth: "none" },
  { method: "get", path: "/auth/csrf", tag: "auth", summary: "Issue CSRF token for cookie clients", auth: "optional" },
  { method: "post", path: "/auth/register", tag: "auth", summary: "Register (generic response)", auth: "none", body: C.RegisterInput },
  { method: "post", path: "/auth/login", tag: "auth", summary: "Web login (cookie session)", auth: "optional", body: C.LoginInput },
  { method: "post", path: "/auth/mobile/login", tag: "auth", summary: "Native client login (bearer token)", auth: "none", body: C.LoginInput },
  { method: "post", path: "/auth/logout", tag: "auth", summary: "Logout (revokes session)", auth: "session" },
  { method: "get", path: "/auth/me", tag: "auth", summary: "Current user", auth: "optional" },
  { method: "post", path: "/auth/verify-email", tag: "auth", summary: "Verify e-mail with one-time token", auth: "none", body: C.VerifyEmailInput },
  { method: "post", path: "/auth/password/forgot", tag: "auth", summary: "Request password reset (generic response)", auth: "none", body: C.RequestResetInput },
  { method: "post", path: "/auth/password/reset", tag: "auth", summary: "Reset password with one-time token", auth: "none", body: C.ResetPasswordInput },
  { method: "post", path: "/auth/password/change", tag: "auth", summary: "Change password (revokes all sessions)", auth: "session", body: C.ChangePasswordInput },
  { method: "post", path: "/auth/reauth", tag: "auth", summary: "Re-authenticate for sensitive actions", auth: "session", body: C.ReauthInput },
  { method: "post", path: "/auth/mfa/setup", tag: "auth", summary: "Start TOTP enrolment (reauth)", auth: "session" },
  { method: "post", path: "/auth/mfa/confirm", tag: "auth", summary: "Confirm TOTP (rotates session)", auth: "session", body: C.MfaConfirmInput },
  { method: "post", path: "/auth/mfa/disable", tag: "auth", summary: "Disable TOTP (reauth; not for privileged roles)", auth: "session" },
  { method: "get", path: "/auth/sessions", tag: "auth", summary: "List devices/sessions", auth: "session" },
  { method: "delete", path: "/auth/sessions/{handle}", tag: "auth", summary: "Revoke a session", auth: "session" },
  { method: "get", path: "/vehicles", tag: "vehicles", summary: "List own vehicles", auth: "session" },
  { method: "post", path: "/vehicles", tag: "vehicles", summary: "Add vehicle", auth: "session", body: C.VehicleInput },
  { method: "get", path: "/vehicles/{id}", tag: "vehicles", summary: "Get own vehicle (VIN masked)", auth: "session" },
  { method: "patch", path: "/vehicles/{id}", tag: "vehicles", summary: "Update vehicle", auth: "session", body: C.VehicleUpdateInput },
  { method: "delete", path: "/vehicles/{id}", tag: "vehicles", summary: "Delete vehicle", auth: "session" },
  { method: "post", path: "/vehicles/{id}/vin", tag: "vehicles", summary: "Reveal full VIN (reauth)", auth: "session" },
  { method: "post", path: "/vehicles/decode-vin", tag: "vehicles", summary: "Decode VIN via provider (suggestion)", auth: "session", body: C.VinDecodeInput },
  { method: "post", path: "/vehicles/{id}/confirm-decode", tag: "vehicles", summary: "Store owner-confirmed decode", auth: "session", body: C.VinDecodeInput },
  { method: "get", path: "/vehicles/{id}/maintenance", tag: "maintenance", summary: "Maintenance log", auth: "session" },
  { method: "post", path: "/vehicles/{id}/maintenance", tag: "maintenance", summary: "Add maintenance record", auth: "session", body: C.MaintenanceRecordInput },
  { method: "get", path: "/vehicles/{id}/reminders", tag: "maintenance", summary: "Reminders", auth: "session" },
  { method: "post", path: "/vehicles/{id}/reminders", tag: "maintenance", summary: "Add reminder (date/odometer)", auth: "session", body: C.ReminderInput },
  { method: "get", path: "/search", tag: "knowledge", summary: "Search codes, symptoms, part names", auth: "optional", query: C.SearchQuery },
  { method: "get", path: "/dtc/{code}", tag: "knowledge", summary: "Coverage-aware code lookup", auth: "optional" },
  { method: "get", path: "/diagnostics", tag: "diagnostics", summary: "List own sessions", auth: "session" },
  { method: "post", path: "/diagnostics", tag: "diagnostics", summary: "Start session", auth: "session", body: C.DiagnosticStartInput },
  { method: "get", path: "/diagnostics/{id}", tag: "diagnostics", summary: "Session detail", auth: "session" },
  { method: "put", path: "/diagnostics/{id}/context", tag: "diagnostics", summary: "Onset, conditions, warning lights", auth: "session", body: C.DiagnosticContextInput },
  { method: "post", path: "/diagnostics/{id}/checks", tag: "diagnostics", summary: "Record a check result", auth: "session", body: C.CheckResultInput },
  { method: "post", path: "/diagnostics/{id}/result", tag: "diagnostics", summary: "Generate structured result (rules + local model)", auth: "session" },
  { method: "get", path: "/diagnostics/{id}/report.pdf", tag: "diagnostics", summary: "Arabic/English PDF report", auth: "session" },
  { method: "post", path: "/diagnostics/{id}/shares", tag: "diagnostics", summary: "Create expiring share link", auth: "session", body: C.ShareCreateInput },
  { method: "delete", path: "/shares/{id}", tag: "diagnostics", summary: "Revoke share link", auth: "session" },
  { method: "get", path: "/reports/shared/{token}", tag: "diagnostics", summary: "Open shared report", auth: "optional" },
  { method: "get", path: "/cases", tag: "learning", summary: "Own repair cases", auth: "session" },
  { method: "post", path: "/cases", tag: "learning", summary: "Submit repair case", auth: "session", body: C.RepairCaseInput },
  { method: "get", path: "/consent", tag: "learning", summary: "Learning consent state", auth: "session" },
  { method: "put", path: "/consent", tag: "learning", summary: "Grant/withdraw learning consent", auth: "session", body: C.ConsentInput },
  { method: "get", path: "/review/cases", tag: "review", summary: "Reviewer queue (no submitter identity)", auth: "session" },
  { method: "post", path: "/review/cases/{id}", tag: "review", summary: "Review decision", auth: "session", body: C.ReviewDecisionInput },
  { method: "post", path: "/uploads", tag: "files", summary: "Upload file (raw body, magic-byte checked, scanned)", auth: "session" },
  { method: "get", path: "/files/{id}", tag: "files", summary: "Download via short-lived signed URL", auth: "optional" },
  { method: "get", path: "/catalog", tag: "market", summary: "Search parts catalogue", auth: "optional" },
  { method: "get", path: "/catalog/{id}", tag: "market", summary: "Product with fitment evidence", auth: "optional" },
  { method: "get", path: "/offer-requests", tag: "market", summary: "Own quote requests and offers", auth: "session" },
  { method: "post", path: "/offer-requests", tag: "market", summary: "Request quotes from merchants", auth: "session", body: C.OfferRequestInput },
  { method: "get", path: "/cart", tag: "market", summary: "Cart with server-side prices", auth: "session" },
  { method: "post", path: "/cart", tag: "market", summary: "Add item", auth: "session", body: C.CartItemInput },
  { method: "post", path: "/checkout", tag: "market", summary: "Place order (Idempotency-Key header required)", auth: "session", body: C.CheckoutInput },
  { method: "get", path: "/orders", tag: "market", summary: "Own orders with merchant sub-orders", auth: "session" },
  { method: "post", path: "/orders/sub/{id}/return", tag: "market", summary: "Request return", auth: "session", body: C.ReturnRequestInput },
  { method: "post", path: "/merchant/apply", tag: "merchant", summary: "Apply as merchant", auth: "session", body: C.MerchantApplyInput },
  { method: "post", path: "/merchant/products", tag: "merchant", summary: "Create product", auth: "session", body: C.ProductInput },
  { method: "get", path: "/merchant/requests", tag: "merchant", summary: "Open quote requests (anonymised)", auth: "session" },
  { method: "post", path: "/merchant/requests/{id}/offers", tag: "merchant", summary: "Submit offer", auth: "session", body: C.OfferInput },
  { method: "patch", path: "/merchant/orders/{id}", tag: "merchant", summary: "Update sub-order status", auth: "session", body: C.MerchantOrderStatusInput },
  { method: "get", path: "/workshops", tag: "workshops", summary: "Workshop directory", auth: "optional" },
  { method: "post", path: "/appointments", tag: "workshops", summary: "Book appointment", auth: "session", body: C.AppointmentInput },
  { method: "patch", path: "/appointments/{id}", tag: "workshops", summary: "Change appointment status", auth: "session", body: C.AppointmentStatusInput },
  { method: "post", path: "/workshop/apply", tag: "workshops", summary: "Apply as workshop", auth: "session", body: C.WorkshopApplyInput },
  { method: "post", path: "/workshop/work-orders", tag: "workshops", summary: "Create work order", auth: "session", body: C.WorkOrderInput },
  { method: "post", path: "/webhooks/test-payment", tag: "payments", summary: "Test gateway webhook (HMAC signed)", auth: "none", notes: "Header x-test-signature: t=<unix>,v1=<base64url HMAC-SHA256>" },
  { method: "get", path: "/account/export", tag: "account", summary: "Export my data (reauth)", auth: "session" },
  { method: "delete", path: "/account", tag: "account", summary: "Delete account (reauth)", auth: "session" },
  { method: "get", path: "/notifications", tag: "account", summary: "In-app notifications", auth: "session" },
  { method: "get", path: "/admin/users", tag: "admin", summary: "Search users (MFA)", auth: "session" },
  { method: "post", path: "/admin/roles", tag: "admin", summary: "Grant/revoke role (MFA + reauth)", auth: "session", body: C.RoleChangeInput },
  { method: "get", path: "/admin/audit", tag: "admin", summary: "Audit log", auth: "session" },
  { method: "get", path: "/admin/providers", tag: "admin", summary: "Provider status, licences, coverage", auth: "session" },
  { method: "get", path: "/catalog/models", tag: "vehicles", summary: "Model names for make/year (NHTSA vPIC; autocomplete only)", auth: "session" },
  { method: "get", path: "/vehicles/{id}/recalls", tag: "vehicles", summary: "US recall campaigns (NHTSA) for own vehicle; status not_configured|ok|unavailable", auth: "session" },
  { method: "post", path: "/orders/{id}/pay", tag: "payments", summary: "Start/retry hosted gateway payment for own online order", auth: "session" },
  { method: "get", path: "/payments/{gateway}/return", tag: "payments", summary: "Browser return from gateway; outcome re-confirmed server-side; 303 to app", auth: "none" },
  { method: "post", path: "/webhooks/qi-card", tag: "payments", summary: "Qi Card notification (RSA-SHA256 X-Signature)", auth: "none", notes: "Signed string: paymentId|amount(3dp)|currency|creationDate|status" },
  { method: "get", path: "/billing/plans", tag: "billing", summary: "Published plans and enabled payment rails", auth: "optional" },
  { method: "get", path: "/billing/me", tag: "billing", summary: "Own entitlements, subscriptions, billable businesses", auth: "session" },
  { method: "post", path: "/billing/subscribe", tag: "billing", summary: "Start a paid plan (gateway redirect or manual confirmation)", auth: "session", body: C.SubscribeInput },
  { method: "get", path: "/merchant/statement", tag: "merchant", summary: "Own commission ledger", auth: "session" },
  { method: "put", path: "/merchant/products/{id}/sponsored", tag: "merchant", summary: "Toggle sponsored flag within plan allowance", auth: "session" },
  { method: "get", path: "/admin/billing/plans", tag: "admin", summary: "Plans and gateway states", auth: "session" },
  { method: "patch", path: "/admin/billing/plans/{id}", tag: "admin", summary: "Set price/publish (reauth)", auth: "session", body: C.PlanUpdateInput },
  { method: "get", path: "/admin/billing/subscriptions", tag: "admin", summary: "Subscriptions by status", auth: "session" },
  { method: "post", path: "/admin/billing/subscriptions/{id}/confirm", tag: "admin", summary: "Confirm manual payment (reauth)", auth: "session", body: C.ManualConfirmInput },
  { method: "post", path: "/admin/billing/subscriptions/{id}/reject", tag: "admin", summary: "Reject manual payment request", auth: "session" },
  { method: "get", path: "/admin/billing/revenue", tag: "admin", summary: "Revenue figures from ledgers", auth: "session" },
];

function schema(s: ZodType) {
  return z.toJSONSchema(s, { io: "input", unrepresentable: "any" });
}

export function openApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of ops) {
    const params = [...op.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    const query = op.query ? Object.entries((schema(op.query) as { properties?: Record<string, unknown> }).properties ?? {}).map(([name, s]) => ({ name, in: "query", schema: s })) : [];
    (paths[op.path] ??= {})[op.method] = {
      tags: [op.tag],
      summary: op.summary,
      description: op.notes,
      security: op.auth === "session" ? [{ cookieSession: [], csrf: [] }, { bearerMobile: [] }] : op.auth === "optional" ? [{}, { cookieSession: [] }, { bearerMobile: [] }] : [],
      parameters: [...params, ...query],
      requestBody: op.body ? { required: true, content: { "application/json": { schema: schema(op.body) } } } : undefined,
      responses: {
        "200": { description: "OK" },
        "4XX": { description: "Error", content: { "application/json": { schema: schema(C.ApiError) } } },
        "429": { description: "Rate limited (Retry-After header)" },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "AutoCare IQ API", version: "1.0.0-dev", description: "All bodies are validated server-side; unknown fields are rejected. Cookie clients must send x-csrf-token on unsafe methods. Native clients use Authorization: Bearer from /auth/mobile/login." },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: {
        cookieSession: { type: "apiKey", in: "cookie", name: "__Host-acq_session" },
        csrf: { type: "apiKey", in: "header", name: "x-csrf-token" },
        bearerMobile: { type: "http", scheme: "bearer" },
      },
    },
    paths,
  };
}
