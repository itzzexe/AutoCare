import "server-only";
import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { getDb } from "../../db/client";
import { dataProviders, licensePolicies } from "../../db/schema";
import { breakerStatus } from "./resilience";
import { PROVIDERS } from "./adapters";
import type { ProviderId, ProviderState } from "./types";

export type LicenseUse = "display" | "cache" | "translation" | "offline" | "embeddings" | "training" | "redistribution";
type Policy = typeof licensePolicies.$inferSelect;

export async function currentPolicy(providerId: ProviderId, at = new Date()): Promise<Policy | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(licensePolicies)
    .where(and(eq(licensePolicies.providerId, providerId), lte(licensePolicies.validFrom, at), or(isNull(licensePolicies.validUntil), gt(licensePolicies.validUntil, at))))
    .orderBy(desc(licensePolicies.validFrom))
    .limit(1);
  return rows[0] ?? null;
}

async function hadPolicy(providerId: ProviderId): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select({ id: licensePolicies.id }).from(licensePolicies).where(eq(licensePolicies.providerId, providerId)).limit(1);
  return rows.length > 0;
}

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  state: ProviderState;
  reason: string;
  capabilities: string[];
  docsUrl: string;
  docsNote: string;
  circuit: "closed" | "open";
  policy: Policy | null;
}

/** Honest provider state: configuration, admin switch and license validity combined. */
export async function providerStatus(id: ProviderId): Promise<ProviderStatus> {
  const info = PROVIDERS[id];
  const db = await getDb();
  const [row] = await db.select().from(dataProviders).where(eq(dataProviders.id, id)).limit(1);
  const policy = await currentPolicy(id);
  let state: ProviderState = "active";
  let reason = "ok";
  if (id === "mock_test") {
    state = info.configured() ? "test_only" : "not_configured";
    reason = info.configured() ? "fixtures_enabled" : "fixtures_disabled";
  } else if (!info.configured()) {
    state = "not_configured";
    reason = info.credentialsPresent?.() ? "credentials_present_adapter_not_implemented" : "missing_credentials_or_contract";
  } else if (row?.status === "disabled") {
    state = "disabled";
    reason = row.statusNote ?? "disabled_by_admin";
  } else if (!policy) {
    state = (await hadPolicy(id)) ? "license_expired" : "not_configured";
    reason = state === "license_expired" ? "license_expired" : "no_license_policy_recorded";
  }
  return { id, name: info.name, state, reason, capabilities: info.capabilities, docsUrl: info.docsUrl, docsNote: info.docsNote, circuit: breakerStatus(id), policy };
}

export async function allProviderStatuses(): Promise<ProviderStatus[]> {
  return Promise.all((Object.keys(PROVIDERS) as ProviderId[]).map(providerStatus));
}

/** May content from this provider be used this way right now? Defaults to "no". */
export async function usageAllowed(id: ProviderId, use: LicenseUse): Promise<boolean> {
  if (id === "mock_test") return PROVIDERS.mock_test.configured() && (use === "display" || use === "cache");
  const s = await providerStatus(id);
  if (s.state !== "active" || !s.policy) return false;
  const p = s.policy;
  switch (use) {
    case "display": return p.allowDisplay;
    case "cache": return p.allowCache;
    case "translation": return p.allowTranslation;
    case "offline": return p.allowOffline;
    case "embeddings": return p.allowEmbeddings;
    case "training": return p.allowTraining;
    case "redistribution": return p.allowRedistribution;
  }
}
