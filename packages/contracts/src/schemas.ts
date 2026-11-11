import { z } from "zod";
import { CURRENCIES, VEHICLE_SALES_MARKETS } from "./geo";
import { isWellFormedVin, normalizeVin } from "./vin";

/**
 * API input/output schemas shared by web and future mobile clients.
 * All request bodies use strictObject: unknown fields are rejected, not stripped.
 */

// ---------- primitives ----------
export const Id = z.uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).optional();
export const Locale = z.enum(["ar", "en"]);
export const Currency = z.enum(Object.keys(CURRENCIES) as [keyof typeof CURRENCIES, ...Array<keyof typeof CURRENCIES>]);
export const MinorAmount = z.int().min(0).max(10_000_000_000);
export const Email = z.email().max(254).transform((e) => e.toLowerCase());
/** Length bounds per OWASP ASVS V2.1: >= 12 chars, allow long passphrases. */
export const Password = z.string().min(12).max(128);

export const Pagination = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const ApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    fields: z.record(z.string(), z.array(z.string())).optional(),
    retryAfterSeconds: z.number().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

// ---------- identity ----------
export const RegisterInput = z.strictObject({
  email: Email,
  password: Password,
  displayName: text(80),
  locale: Locale.default("ar"),
  acceptTerms: z.literal(true),
  termsVersion: text(20),
});
export const LoginInput = z.strictObject({
  email: Email,
  password: z.string().min(1).max(128),
  totp: z.string().regex(/^\d{6}$/).optional(),
});
export const RequestResetInput = z.strictObject({ email: Email });
export const ResetPasswordInput = z.strictObject({
  token: z.string().min(20).max(200),
  password: Password,
});
export const VerifyEmailInput = z.strictObject({ token: z.string().min(20).max(200) });
export const ChangePasswordInput = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: Password,
});
export const ReauthInput = z.strictObject({
  password: z.string().min(1).max(128),
  totp: z.string().regex(/^\d{6}$/).optional(),
});
export const MfaConfirmInput = z.strictObject({ totp: z.string().regex(/^\d{6}$/) });

export const ROLES = [
  "vehicle_owner",
  "merchant",
  "workshop",
  "technical_reviewer",
  "moderator",
  "sysadmin",
] as const;
export type Role = (typeof ROLES)[number];
export const RoleChangeInput = z.strictObject({
  userId: Id,
  role: z.enum(ROLES),
  action: z.enum(["grant", "revoke"]),
  reason: text(300),
});

// ---------- vehicles ----------
export const FUELS = ["petrol", "diesel", "hybrid", "phev", "ev", "lpg", "cng", "other"] as const;
export const TRANSMISSIONS = ["manual", "automatic", "cvt", "dct", "other"] as const;
export const OdometerUnit = z.enum(["km", "mi"]);

export const VehicleInput = z.strictObject({
  nickname: optText(60),
  make: text(60),
  model: text(80),
  year: z.int().min(1950).max(new Date().getUTCFullYear() + 1),
  engine: optText(80),
  fuel: z.enum(FUELS),
  transmission: z.enum(TRANSMISSIONS),
  salesMarket: z.enum(VEHICLE_SALES_MARKETS),
  odometer: z.int().min(0).max(5_000_000).optional(),
  odometerUnit: OdometerUnit.default("km"),
  vin: z
    .string()
    .max(40)
    .transform(normalizeVin)
    .refine((v) => v === "" || isWellFormedVin(v), { message: "vin_malformed" })
    .optional(),
  /** User explicitly confirmed decoded VIN data matches the car. */
  vinDataConfirmed: z.boolean().optional(),
});
export const VehicleUpdateInput = VehicleInput.partial();
export const VinDecodeInput = z.strictObject({
  vin: z.string().max(40).transform(normalizeVin).refine(isWellFormedVin, { message: "vin_malformed" }),
  modelYear: z.int().min(1980).max(2100).optional(),
});

// ---------- search ----------
export const SearchQuery = z.object({
  q: z.string().trim().min(1).max(200),
  vehicleId: Id.optional(),
  kind: z.enum(["auto", "code", "symptom", "part"]).default("auto"),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

// ---------- diagnostics ----------
export const DiagnosticStartInput = z.strictObject({
  vehicleId: Id,
  codes: z.array(z.string().trim().min(2).max(16)).max(20).default([]),
  symptoms: z.string().trim().max(2000).default(""),
});
export const ONSET = ["sudden", "gradual", "intermittent", "after_service", "unknown"] as const;
export const WARNING_LIGHTS = ["check_engine", "check_engine_flashing", "abs", "airbag", "battery", "oil", "temp", "brake", "ev_system", "tpms", "steering"] as const;
export type WarningLight = (typeof WARNING_LIGHTS)[number];
export const CONDITIONS = ["cold_start", "hot_engine", "idle", "acceleration", "highway", "rain", "ac_on", "braking", "turning"] as const;
export const DiagnosticContextInput = z.strictObject({
  onset: z.enum(ONSET).optional(),
  conditions: z.array(z.enum(CONDITIONS)).max(CONDITIONS.length).optional(),
  recentMaintenance: z.string().trim().max(1000).optional(),
  relatedCodes: z.array(z.string().trim().min(2).max(16)).max(20).optional(),
  warningLights: z.array(z.enum(WARNING_LIGHTS)).max(WARNING_LIGHTS.length).optional(),
});
export const CheckResultInput = z.strictObject({
  checkId: text(80),
  result: z.enum(["pass", "fail", "not_done", "unsure"]),
  value: optText(200),
  note: optText(500),
});

/** Urgency is decided by deterministic rules, never by model free text. */
export const URGENCY = ["stop_driving", "urgent", "soon", "monitor", "insufficient_info"] as const;
export type Urgency = (typeof URGENCY)[number];

export const SourceRef = z.object({
  id: z.string().max(80),
  title: z.string().max(300),
  provider: z.string().max(80),
  version: z.string().max(40).nullable(),
});

/**
 * Structured diagnosis the model must return. Validated server-side; anything
 * failing validation is discarded and the rules-only result is shown instead.
 */
export const ModelDiagnosis = z.strictObject({
  summary: z.string().max(1200),
  likelyCauses: z
    .array(
      z.strictObject({
        cause: z.string().max(300),
        evidence: z.array(z.string().max(300)).max(6),
        sourceIds: z.array(z.string().max(80)).max(6),
      }),
    )
    .max(6),
  missingInformation: z.array(z.string().max(300)).max(8),
  nextCheck: z.string().max(400).nullable(),
  workshopAdvice: z.string().max(400).nullable(),
  conditionalParts: z
    .array(z.strictObject({ part: z.string().max(120), onlyIf: z.string().max(300) }))
    .max(6),
  insufficientEvidence: z.boolean(),
});
export type ModelDiagnosis = z.infer<typeof ModelDiagnosis>;

// ---------- cases & consent ----------
export const CASE_STATUS = ["submitted", "needs_review", "verified", "rejected", "inconclusive"] as const;
export const RepairCaseInput = z.strictObject({
  vehicleId: Id.optional(),
  diagnosticSessionId: Id.optional(),
  codes: z.array(z.string().trim().min(2).max(16)).max(20).default([]),
  symptoms: z.string().trim().max(2000).default(""),
  measurements: z.array(z.strictObject({ name: text(80), value: text(80), unit: optText(20) })).max(20).default([]),
  confirmedCause: optText(500),
  confirmedBy: z.enum(["owner", "mechanic", "dealer", "unknown"]).default("unknown"),
  repairPerformed: optText(1000),
  partsReplaced: z.array(z.strictObject({ name: text(120), oeNumber: optText(40) })).max(20).default([]),
  repairDate: z.iso.date().optional(),
  costMinor: MinorAmount.optional(),
  currency: Currency.optional(),
  outcome: z.enum(["resolved", "persisted", "partially", "unknown"]).default("unknown"),
  attachmentIds: z.array(Id).max(6).default([]),
});
export const ReviewDecisionInput = z.strictObject({
  decision: z.enum(["verified", "rejected", "inconclusive", "needs_review"]),
  notes: text(2000),
  evidence: z.array(text(300)).max(10).default([]),
});
export const ConsentInput = z.strictObject({
  purpose: z.literal("learning"),
  granted: z.boolean(),
  textVersion: text(20),
  sources: z.array(z.enum(["repair_cases", "diagnostic_sessions"])).min(1).max(2).optional(),
});

// ---------- marketplace ----------
export const PART_CONDITION = ["new", "used", "refurbished"] as const;
export const AUTHENTICITY = ["oem_genuine", "oem_equivalent", "aftermarket", "unknown"] as const;
export const ProductInput = z.strictObject({
  titleAr: text(160),
  titleEn: optText(160),
  brand: text(80),
  category: text(80),
  oeNumbers: z.array(z.string().trim().min(3).max(40)).max(20).default([]),
  condition: z.enum(PART_CONDITION),
  authenticityClaim: z.enum(AUTHENTICITY),
  priceMinor: MinorAmount,
  currency: Currency,
  stockQty: z.int().min(0).max(100_000),
  warrantyDays: z.int().min(0).max(3650).default(0),
  returnDays: z.int().min(0).max(365).default(0),
  deliveryOptions: z.array(z.enum(["pickup", "delivery"])).min(1).max(2),
  imageIds: z.array(Id).max(6).default([]),
  fitments: z
    .array(
      z.strictObject({
        make: text(60),
        model: text(80),
        yearFrom: z.int().min(1950).max(2100),
        yearTo: z.int().min(1950).max(2100),
        engine: optText(80),
        market: z.enum(VEHICLE_SALES_MARKETS).optional(),
      }),
    )
    .max(50)
    .default([]),
});
export const MerchantApplyInput = z.strictObject({
  name: text(120),
  governorate: z.string().length(3),
  city: text(80),
  phone: z.string().trim().regex(/^\+?[0-9 ]{7,20}$/),
  description: optText(1000),
});
export const OfferRequestInput = z.strictObject({
  vehicleId: Id,
  partDescription: text(300),
  oeNumber: optText(40),
  quantity: z.int().min(1).max(20),
  governorate: z.string().length(3),
});
export const OfferInput = z.strictObject({
  productId: Id.optional(),
  priceMinor: MinorAmount,
  currency: Currency,
  condition: z.enum(PART_CONDITION),
  warrantyDays: z.int().min(0).max(3650),
  deliveryFeeMinor: MinorAmount.default(0),
  etaDays: z.int().min(0).max(60),
  notes: optText(500),
});
export const CartItemInput = z.strictObject({
  productId: Id.optional(),
  offerId: Id.optional(),
  quantity: z.int().min(1).max(20),
}).refine((v) => Boolean(v.productId) !== Boolean(v.offerId), { message: "exactly_one_of_product_or_offer" });

export const CheckoutInput = z.strictObject({
  paymentMethod: z.enum(["cod", "qi_card", "zaincash", "test_gateway"]),
  fulfilment: z.enum(["pickup", "delivery"]),
  address: z
    .strictObject({
      governorate: z.string().length(3),
      city: text(80),
      street: text(200),
      landmark: optText(200),
      recipientName: text(80),
      phone: z.string().trim().regex(/^\+?[0-9 ]{7,20}$/),
    })
    .optional(),
});
export const MERCHANT_ORDER_STATUS = ["pending", "confirmed", "shipped", "delivered", "cancelled", "return_requested", "returned"] as const;
export const MerchantOrderStatusInput = z.strictObject({
  status: z.enum(MERCHANT_ORDER_STATUS),
  note: optText(300),
});
export const ReturnRequestInput = z.strictObject({ reason: text(500) });
export const ReviewInput = z.strictObject({
  rating: z.int().min(1).max(5),
  body: z.string().trim().max(2000).default(""),
});

// ---------- workshops ----------
export const WorkshopApplyInput = z.strictObject({
  name: text(120),
  governorate: z.string().length(3),
  city: text(80),
  address: text(300),
  phone: z.string().trim().regex(/^\+?[0-9 ]{7,20}$/),
  specialties: z.array(z.enum(["engine", "transmission", "electrical", "ac", "brakes", "suspension", "body", "hybrid_ev", "diagnostics", "tyres"])).min(1).max(10),
  brands: z.array(text(40)).max(30).default([]),
});
export const AppointmentInput = z.strictObject({
  workshopId: Id,
  vehicleId: Id,
  preferredAt: z.iso.datetime({ offset: true }),
  note: optText(500),
  shareDiagnosticSessionId: Id.optional(),
});
export const APPOINTMENT_STATUS = ["requested", "confirmed", "declined", "rescheduled", "completed", "cancelled", "no_show"] as const;
export const AppointmentStatusInput = z.strictObject({
  status: z.enum(APPOINTMENT_STATUS),
  proposedAt: z.iso.datetime({ offset: true }).optional(),
  note: optText(300),
});
export const WorkOrderInput = z.strictObject({
  appointmentId: Id,
  checks: z.array(z.strictObject({ name: text(120), result: text(300) })).max(30).default([]),
  quoteMinor: MinorAmount.optional(),
  currency: Currency.optional(),
  resultNotes: optText(2000),
  status: z.enum(["open", "quoted", "in_progress", "done", "cancelled"]).default("open"),
});

// ---------- maintenance ----------
export const MaintenanceRecordInput = z.strictObject({
  kind: text(80),
  performedAt: z.iso.date(),
  odometer: z.int().min(0).max(5_000_000).optional(),
  notes: optText(1000),
  costMinor: MinorAmount.optional(),
  currency: Currency.optional(),
});
export const ReminderInput = z.strictObject({
  title: text(120),
  dueDate: z.iso.date().optional(),
  dueOdometer: z.int().min(0).max(5_000_000).optional(),
}).refine((v) => v.dueDate || v.dueOdometer !== undefined, { message: "due_date_or_odometer_required" });

// ---------- sharing ----------
export const ShareCreateInput = z.strictObject({
  ttlHours: z.int().min(1).max(24 * 14).default(72),
  workshopId: Id.optional(),
});

// ---------- billing ----------
export const PlanId = z.string().regex(/^[a-z][a-z0-9_]{2,40}$/);
export const SubscribeInput = z.strictObject({
  planId: PlanId,
  subjectKind: z.enum(["user", "workshop", "merchant"]),
  /** Omitted for owner plans (the subject is the signed-in user). */
  subjectId: Id.optional(),
  method: z.enum(["qi_card", "zaincash", "manual"]),
});
export const PlanEntitlementsInput = z.strictObject({
  maxVehicles: z.int().min(1).max(100).optional(),
  aiExplanationsPerMonth: z.int().min(0).max(10_000).optional(),
  featuredListing: z.boolean().optional(),
  sponsoredProducts: z.int().min(0).max(100).optional(),
  commissionBps: z.int().min(0).max(3000).optional(),
  offerResponsesPerMonth: z.int().min(0).max(100_000).optional(),
  analytics: z.boolean().optional(),
});
export const PlanUpdateInput = z.strictObject({
  priceMinor: z.int().min(0).max(100_000_000).nullable().optional(),
  published: z.boolean().optional(),
  periodDays: z.int().min(1).max(366).optional(),
  entitlements: PlanEntitlementsInput.optional(),
});
export const ManualConfirmInput = z.strictObject({ note: optText(500) });
