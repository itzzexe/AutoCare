import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { maskVin, vinCheckDigitValid, type VehicleInput } from "@autocare/contracts";
import type { z } from "zod";
import { env } from "../../config/env";
import { getDb } from "../../db/client";
import { sourceRecords, vehicles } from "../../db/schema";
import { decryptField, encryptField, sha256Hex } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { rateLimit } from "../../lib/rate-limit";
import { assertVehicleAllowance } from "../billing/service";
import { audit } from "../audit/audit";
import { mockTest, nhtsaVpic } from "../providers/adapters";
import { providerStatus } from "../providers/registry";
import type { VinDecodeResult } from "../providers/types";

type VehicleIn = z.output<typeof VehicleInput>;
type Row = typeof vehicles.$inferSelect;

/** Public shape: never includes the full VIN. */
export function toVehicleDto(v: Row) {
  return {
    id: v.id,
    nickname: v.nickname,
    make: v.make,
    model: v.model,
    year: v.year,
    engine: v.engine,
    fuel: v.fuel,
    transmission: v.transmission,
    salesMarket: v.salesMarket,
    odometer: v.odometer,
    odometerUnit: v.odometerUnit,
    vinMasked: v.vinMasked,
    vinDataConfirmed: Boolean(v.vinDataConfirmedAt),
    vinDecode: v.vinDecode,
    createdAt: v.createdAt.toISOString(),
  };
}
export type VehicleDto = ReturnType<typeof toVehicleDto>;

/** Ownership is part of every query; a foreign id yields not_found (no existence leak). */
export async function getOwnedVehicle(userId: string, vehicleId: string): Promise<Row> {
  const db = await getDb();
  const [v] = await db.select().from(vehicles).where(and(eq(vehicles.id, vehicleId), eq(vehicles.ownerId, userId), isNull(vehicles.deletedAt))).limit(1);
  if (!v) throw new AppError("not_found");
  return v;
}

export async function listVehicles(userId: string) {
  const db = await getDb();
  const rows = await db.select().from(vehicles).where(and(eq(vehicles.ownerId, userId), isNull(vehicles.deletedAt))).orderBy(desc(vehicles.createdAt)).limit(50);
  return rows.map(toVehicleDto);
}

function vinFields(vehicleId: string, vin: string | undefined) {
  if (!vin) return { vinEnc: null, vinMasked: null };
  return { vinEnc: encryptField(vin, `vehicle:${vehicleId}:vin`), vinMasked: maskVin(vin) };
}

export async function createVehicle(userId: string, input: VehicleIn) {
  const db = await getDb();
  const count = (await listVehicles(userId)).length;
  if (count >= 20) throw new AppError("conflict", "vehicle_limit_reached");
  await assertVehicleAllowance(userId);
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(vehicles)
    .values({
      id,
      ownerId: userId,
      nickname: input.nickname || null,
      make: input.make,
      model: input.model,
      year: input.year,
      engine: input.engine || null,
      fuel: input.fuel,
      transmission: input.transmission,
      salesMarket: input.salesMarket,
      odometer: input.odometer ?? null,
      odometerUnit: input.odometerUnit,
      ...vinFields(id, input.vin || undefined),
      vinDataConfirmedAt: input.vin && input.vinDataConfirmed ? new Date() : null,
    })
    .returning();
  return toVehicleDto(row!);
}

export async function updateVehicle(userId: string, vehicleId: string, input: Partial<VehicleIn>) {
  const existing = await getOwnedVehicle(userId, vehicleId);
  const db = await getDb();
  const patch: Partial<typeof vehicles.$inferInsert> = { updatedAt: new Date() };
  for (const k of ["nickname", "make", "model", "year", "engine", "fuel", "transmission", "salesMarket", "odometer", "odometerUnit"] as const) {
    if (input[k] !== undefined) (patch as Record<string, unknown>)[k] = input[k];
  }
  if (input.vin !== undefined) {
    Object.assign(patch, vinFields(vehicleId, input.vin || undefined));
    patch.vinDecode = null;
    patch.vinDataConfirmedAt = null;
  }
  if (input.vinDataConfirmed && (input.vin || existing.vinEnc)) patch.vinDataConfirmedAt = new Date();
  const [row] = await db.update(vehicles).set(patch).where(and(eq(vehicles.id, vehicleId), eq(vehicles.ownerId, userId))).returning();
  return toVehicleDto(row!);
}

export async function deleteVehicle(userId: string, vehicleId: string, requestId?: string) {
  await getOwnedVehicle(userId, vehicleId);
  const db = await getDb();
  await db.update(vehicles).set({ deletedAt: new Date(), vinEnc: null, vinMasked: null }).where(and(eq(vehicles.id, vehicleId), eq(vehicles.ownerId, userId)));
  await audit({ action: "vehicle.deleted", actorUserId: userId, targetKind: "vehicle", targetId: vehicleId, requestId });
}

/** Owner-only: reveal the full VIN of their own vehicle (e.g. to copy it). */
export async function revealVin(userId: string, vehicleId: string): Promise<string | null> {
  const v = await getOwnedVehicle(userId, vehicleId);
  return v.vinEnc ? decryptField(v.vinEnc, `vehicle:${v.id}:vin`) : null;
}

export interface VinDecodeResponse {
  provider: string;
  providerState: string;
  checkDigitValid: boolean;
  result: VinDecodeResult | null;
  note: "suggestion_requires_confirmation";
}

/**
 * Decode a VIN via the configured provider. The result is a SUGGESTION the
 * user must confirm; it is never treated as proof of part fitment.
 * The VIN is sent to the provider (NHTSA, a US government service) only on
 * this explicit user action — disclosed in the UI.
 */
export async function decodeVin(userId: string, vin: string, modelYear?: number, requestId?: string): Promise<VinDecodeResponse> {
  await rateLimit("vin:user", userId);
  const useMock = env().ENABLE_MOCK_PROVIDERS && mockTest.configured();
  const decoder = useMock ? mockTest : nhtsaVpic;
  const status = await providerStatus(decoder.id);
  const checkDigitValid = vinCheckDigitValid(vin);
  if (status.state !== "active" && status.state !== "test_only") {
    return { provider: decoder.id, providerState: status.state, checkDigitValid, result: null, note: "suggestion_requires_confirmation" };
  }
  const result = await decoder.decodeVin(vin, modelYear);
  await audit({ action: "vehicle.vin_decoded", actorUserId: userId, targetKind: "provider", targetId: decoder.id, requestId, meta: { wmi: vin.slice(0, 3), warnings: result.warnings.length } });
  return { provider: decoder.id, providerState: status.state, checkDigitValid, result, note: "suggestion_requires_confirmation" };
}

/** Store a decode the user has confirmed against their vehicle. */
export async function attachConfirmedDecode(userId: string, vehicleId: string, decode: VinDecodeResult, providerId: string) {
  await getOwnedVehicle(userId, vehicleId);
  const db = await getDb();
  const [src] = await db
    .insert(sourceRecords)
    .values({ providerId, title: `VIN decode ${decode.make ?? ""} ${decode.model ?? ""}`.trim(), language: "en", version: null, payloadHash: sha256Hex(JSON.stringify(decode.raw)) })
    .returning({ id: sourceRecords.id });
  await db
    .update(vehicles)
    .set({ vinDecode: { ...decode.raw, warnings: decode.warnings }, vinDecodeSourceId: src!.id, vinDataConfirmedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.ownerId, userId)));
}

/** Snapshot without identifiers, for sharing with merchants/workshops/learning. */
export function vehicleSnapshot(v: Row) {
  return { make: v.make, model: v.model, year: v.year, engine: v.engine, fuel: v.fuel, transmission: v.transmission, salesMarket: v.salesMarket };
}
