import { sql } from "drizzle-orm";
import { boolean, index, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, encrypted, pk, ts, updatedAt } from "./common";

export const users = pgTable(
  "users",
  {
    id: pk(),
    email: text("email").notNull(),
    emailVerifiedAt: ts("email_verified_at"),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    locale: text("locale").notNull().default("ar"),
    phoneEnc: encrypted("phone_enc"),
    status: text("status", { enum: ["active", "disabled", "deleted"] }).notNull().default("active"),
    mfaSecretEnc: encrypted("mfa_secret_enc"),
    mfaEnabledAt: ts("mfa_enabled_at"),
    termsVersion: text("terms_version"),
    termsAcceptedAt: ts("terms_accepted_at"),
    passwordChangedAt: ts("password_changed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)],
);

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
});

export const permissions = pgTable("permissions", {
  id: text("id").primaryKey(),
  description: text("description").notNull(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: text("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionId: text("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId: text("role_id").notNull().references(() => roles.id),
    grantedBy: uuid("granted_by").references(() => users.id),
    grantedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

/**
 * Server-side sessions. `id` is SHA-256(token); the raw token only ever lives
 * in the HttpOnly cookie (web) or the OS secure store (future mobile).
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    client: text("client", { enum: ["web", "mobile"] }).notNull().default("web"),
    userAgent: text("user_agent"),
    ipPrefix: text("ip_prefix"),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    idleExpiresAt: ts("idle_expires_at").notNull(),
    absoluteExpiresAt: ts("absolute_expires_at").notNull(),
    mfaVerified: boolean("mfa_verified").notNull().default(false),
    reauthAt: ts("reauth_at"),
    revokedAt: ts("revoked_at"),
    revokeReason: text("revoke_reason"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** One-time tokens for email verification and password reset; only hashes are stored. */
export const userTokens = pgTable(
  "user_tokens",
  {
    id: pk(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: ["email_verify", "password_reset"] }).notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("user_tokens_hash_uq").on(t.tokenHash), index("user_tokens_user_idx").on(t.userId, t.purpose)],
);

/**
 * Outbound messages that WOULD be sent (verification, reset). No email
 * provider is configured, so in development they are visible to the sysadmin
 * dev-outbox; in production sending is blocked until a provider is set up.
 */
export const outbox = pgTable("outbox", {
  id: pk(),
  channel: text("channel", { enum: ["email", "sms"] }).notNull(),
  toUserId: uuid("to_user_id").references(() => users.id, { onDelete: "cascade" }),
  template: text("template").notNull(),
  /** Encrypted because it can contain one-time links. */
  payloadEnc: encrypted("payload_enc").notNull(),
  status: text("status", { enum: ["queued", "not_configured", "sent", "failed"] }).notNull(),
  createdAt: createdAt(),
});
