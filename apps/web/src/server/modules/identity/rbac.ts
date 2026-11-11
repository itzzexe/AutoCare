import type { Role } from "@autocare/contracts";

/**
 * Role-based permissions. This map is the source of truth; `pnpm db:sync-rbac`
 * mirrors it into the roles/permissions tables for reporting. Resource
 * OWNERSHIP is checked separately in each service query — a permission alone
 * never grants access to another user's or another merchant's data.
 */
export const PERMISSIONS = {
  "vehicle:own": "Manage own vehicles",
  "diagnostics:own": "Run and view own diagnostic sessions",
  "case:submit": "Submit own repair cases",
  "market:buy": "Request offers, use cart, place orders",
  "workshop:book": "Book workshop appointments",
  "merchant:operate": "Operate a merchant account the user is a member of",
  "workshop:operate": "Operate a workshop the user is a member of",
  "cases:review": "Review submitted repair cases",
  "knowledge:manage": "Edit DTC definitions, coverage records and knowledge documents",
  "moderation:merchants": "Approve/suspend merchants and workshops",
  "moderation:content": "Moderate reviews and verify part authenticity",
  "admin:users": "View users and change roles",
  "admin:providers": "Configure data providers and license policies",
  "admin:audit": "Read the audit log",
  "admin:learning": "Build datasets, register and approve model versions",
  "admin:dev_outbox": "Read the development outbox (dev only)",
  "admin:billing": "Set plan prices, confirm manual payments, view revenue",
} as const;
export type Permission = keyof typeof PERMISSIONS;

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  vehicle_owner: ["vehicle:own", "diagnostics:own", "case:submit", "market:buy", "workshop:book"],
  merchant: ["merchant:operate"],
  workshop: ["workshop:operate"],
  technical_reviewer: ["cases:review", "knowledge:manage"],
  moderator: ["moderation:merchants", "moderation:content"],
  sysadmin: ["admin:users", "admin:providers", "admin:audit", "admin:learning", "admin:dev_outbox", "moderation:merchants", "admin:billing"],
};

export const ROLE_LABELS: Record<Role, { ar: string; en: string }> = {
  vehicle_owner: { ar: "مالك سيارة", en: "Vehicle owner" },
  merchant: { ar: "تاجر قطع", en: "Parts merchant" },
  workshop: { ar: "ورشة", en: "Workshop" },
  technical_reviewer: { ar: "مراجع فني", en: "Technical reviewer" },
  moderator: { ar: "مشرف", en: "Moderator" },
  sysadmin: { ar: "مدير النظام", en: "System administrator" },
};

/** Roles whose sessions are shorter and require MFA. */
export const PRIVILEGED_ROLES: Role[] = ["technical_reviewer", "moderator", "sysadmin"];

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
  return set;
}

export function isPrivileged(roles: readonly Role[]): boolean {
  return roles.some((r) => PRIVILEGED_ROLES.includes(r));
}
