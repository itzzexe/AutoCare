import "server-only";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { nhtsaRecalls, nhtsaVpic } from "../providers/adapters";
import { usageAllowed } from "../providers/registry";
import type { RecallRecord } from "../providers/types";
import { getOwnedVehicle } from "./service";

/**
 * Public-data enrichments for a user's vehicle: US recall campaigns (NHTSA)
 * and the vPIC model list used for autocomplete. Both are optional: when the
 * provider is not configured, not licensed for display, or down, the caller
 * gets an explicit status instead of an empty list pretending to be "no recalls".
 */

type CacheEntry<T> = { at: number; value: T };
const g = globalThis as { __acqExtCache?: Map<string, CacheEntry<unknown>> };
const cache: Map<string, CacheEntry<unknown>> = (g.__acqExtCache ??= new Map());
const MAX_ENTRIES = 1000;

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function clearExternalCache(): void {
  cache.clear();
}

export type ExternalStatus = "ok" | "not_configured" | "unavailable";

export interface RecallsResponse {
  status: ExternalStatus;
  provider: "nhtsa_recalls";
  /** NHTSA data covers vehicles sold in the US; shown with this caveat always. */
  market: "US";
  vehicle: { make: string; model: string; year: number };
  recalls: RecallRecord[];
  checkedAt: string;
}

export async function vehicleRecalls(userId: string, vehicleId: string): Promise<RecallsResponse> {
  const v = await getOwnedVehicle(userId, vehicleId);
  const base = { provider: "nhtsa_recalls" as const, market: "US" as const, vehicle: { make: v.make, model: v.model, year: v.year }, checkedAt: new Date().toISOString() };
  if (!(await usageAllowed("nhtsa_recalls", "display"))) return { ...base, status: "not_configured", recalls: [] };
  const key = `recalls:${v.make.toLowerCase()}|${v.model.toLowerCase()}|${v.year}`;
  try {
    const recalls = await cached(key, 6 * 3600_000, () => nhtsaRecalls.recallsByVehicle(v.make, v.model, v.year));
    return { ...base, status: "ok", recalls };
  } catch (e) {
    logger.warn({ provider: "nhtsa_recalls", err: (e as Error).message }, "recall lookup failed");
    return { ...base, status: "unavailable", recalls: [] };
  }
}

export interface ModelsResponse {
  status: ExternalStatus;
  provider: "nhtsa_vpic";
  models: string[];
}

export async function modelSuggestions(make: string, year: number): Promise<ModelsResponse> {
  const base = { provider: "nhtsa_vpic" as const };
  if (!(await usageAllowed("nhtsa_vpic", "display"))) return { ...base, status: "not_configured", models: [] };
  try {
    const models = await cached(`models:${make.toLowerCase()}|${year}`, 24 * 3600_000, () => nhtsaVpic.modelsForMakeYear(make, year));
    return { ...base, status: "ok", models };
  } catch (e) {
    if (e instanceof AppError && e.code === "provider_not_configured") return { ...base, status: "not_configured", models: [] };
    logger.warn({ provider: "nhtsa_vpic", err: (e as Error).message }, "model list failed");
    return { ...base, status: "unavailable", models: [] };
  }
}
