import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { extractDtcs, normalizeVin, parseDtc, searchKey, vinCheckDigitValid } from "@autocare/contracts";
import { getDb } from "@/server/db/client";
import { dataProviders, dtcApplicability, dtcDefinitions, licensePolicies, sourceRecords } from "@/server/db/schema";
import { AppError } from "@/server/lib/errors";
import { lookupDtc, textSearch } from "@/server/modules/knowledge/dtc-service";
import { mockTest, nhtsaVpic } from "@/server/modules/providers/adapters";
import { providerStatus, usageAllowed } from "@/server/modules/providers/registry";
import { resilientCall, ProviderHttpError } from "@/server/modules/providers/resilience";
import { freshDb } from "./support/db";

let toyotaDefId: string;

beforeAll(async () => {
  const db = await freshDb();
  // Fixture manufacturer definition (test-only source) to exercise applicability rules.
  const [src] = await db.insert(sourceRecords).values({ providerId: "mock_test", title: "fixture manufacturer source", language: "en", version: "fx-1" }).returning();
  const [def] = await db
    .insert(dtcDefinitions)
    .values({ code: "P1349", rawFormat: "P1349", format: "sae_j2012", scope: "manufacturer", make: "Toyota", system: "powertrain", titleAr: "تعريف تجريبي", titleEn: "Fixture manufacturer definition", meaningAr: "x", meaningEn: "x", skillLevel: "workshop", sourceRecordId: src!.id, version: "fx-1", searchText: "p1349" })
    .returning();
  toyotaDefId = def!.id;
  await db.insert(dtcApplicability).values({ dtcDefinitionId: def!.id, make: "Toyota", model: "Corolla", yearFrom: 2003, yearTo: 2008, sourceRecordId: src!.id });
});

describe("code parsing (not only Pxxxx)", () => {
  it("classifies generic, manufacturer, FTB, hex and legacy formats", () => {
    expect(parseDtc("p0300")).toMatchObject({ code: "P0300", scope: "generic", format: "sae_j2012", system: "powertrain" });
    expect(parseDtc("P1349")).toMatchObject({ scope: "manufacturer" });
    expect(parseDtc("U0100-87")).toMatchObject({ code: "U0100", failureType: "87", format: "sae_j2012_ftb", system: "network" });
    expect(parseDtc("B1A2B 1C")).toMatchObject({ code: "B1A2B", failureType: "1C", scope: "manufacturer" });
    expect(parseDtc("2A82")).toMatchObject({ format: "manufacturer_hex", scope: "manufacturer" });
    expect(parseDtc("16804")).toMatchObject({ format: "legacy_numeric", scope: "manufacturer" });
    expect(parseDtc("C3000")).toMatchObject({ scope: "reserved" });
    expect(parseDtc("hello")).toBeNull();
    expect(parseDtc("2015")).toBeNull();
  });

  it("extracts codes from Arabic free text with Arabic-Indic digits and invisible marks", () => {
    const codes = extractDtcs("ظهر عندي P٠٣٠١ و ‏P0171، وأيضًا U0100 87").map((c) => `${c.code}${c.failureType ? "-" + c.failureType : ""}`);
    expect(codes).toEqual(["P0301", "P0171", "U0100-87"]);
  });

  it("normalises Arabic for search without changing meaning", () => {
    expect(searchKey("أُوتوكِير الإصلاحُ")).toBe(searchKey("اوتوكير الاصلاح"));
    expect(searchKey("رجفةٌ")).toBe("رجفه");
  });

  it("validates VIN check digits but treats them as advisory", () => {
    expect(vinCheckDigitValid(normalizeVin("1HGCM82633A004352"))).toBe(true);
    expect(vinCheckDigitValid("1HGCM82633A004353")).toBe(false);
  });
});

describe("coverage-aware lookup", () => {
  it("answers a generic code from the editorial drafts and labels it unreviewed", async () => {
    const r = (await lookupDtc("P0420"))!;
    expect(r.status).toBe("covered");
    expect(r.definitions[0]!.reviewStatus).toBe("draft");
    expect(r.definitions[0]!.source.provider).toBe("internal_curated");
    expect(r.definitions[0]!.checks[0]!.invasiveness).toBeLessThanOrEqual(r.definitions[0]!.checks.at(-1)!.invasiveness);
  });

  it("never answers a manufacturer code with a generic meaning", async () => {
    const noVehicle = (await lookupDtc("P1349"))!;
    expect(noVehicle.status).toBe("needs_vehicle");
    expect(noVehicle.definitions).toHaveLength(0);

    const otherMake = (await lookupDtc("P1349", { make: "Nissan", model: "Sunny", year: 2010 }))!;
    expect(otherMake.status).toBe("not_covered");
    expect(otherMake.definitions).toHaveLength(0);

    const sameMakeWrongYear = (await lookupDtc("P1349", { make: "Toyota", model: "Corolla", year: 2015 }))!;
    expect(sameMakeWrongYear.status).toBe("make_only");
    expect(sameMakeWrongYear.definitions).toHaveLength(0);

    const match = (await lookupDtc("P1349", { make: "toyota", model: "Corolla", year: 2005 }))!;
    expect(match.status).toBe("covered");
    expect(match.definitions[0]!.id).toBe(toyotaDefId);
  });

  it("reports an uncovered manufacturer hex code honestly", async () => {
    const r = (await lookupDtc("2A82", { make: "BMW", model: "320i", year: 2012 }))!;
    expect(r.status).toBe("not_covered");
    expect(r.explanation).toBe("manufacturer_code_vehicle_not_covered");
  });

  it("flags disagreement between sources", async () => {
    const r = (await lookupDtc("P0171"))!;
    expect(r.external.map((e) => e.provider)).toContain("mock_test");
    expect(r.conflicts.length).toBeGreaterThan(0);
  });

  it("stops serving content whose licensed cache period expired", async () => {
    const db = await getDb();
    const [src] = await db.insert(sourceRecords).values({ providerId: "mock_test", title: "expiring", language: "en", expiresAt: new Date(Date.now() - 1000) }).returning();
    await db.insert(dtcDefinitions).values({ code: "P0700", rawFormat: "P0700", format: "sae_j2012", scope: "generic", system: "powertrain", titleAr: "منتهي", titleEn: "EXPIRED COPY", meaningAr: "x", meaningEn: "x", skillLevel: "workshop", sourceRecordId: src!.id, version: "exp" });
    const r = (await lookupDtc("P0700"))!;
    expect(r.definitions.map((d) => d.titleEn)).not.toContain("EXPIRED COPY");
  });

  it("maps Iraqi part names to technical terms", async () => {
    const hits = await textSearch("دينمو");
    expect(hits.find((h) => h.kind === "part_term")?.titleEn).toBe("Alternator");
    const symptom = await textSearch("رجفة");
    // A colloquial symptom lands on the symptom guide, which links the misfire codes.
    const guide = symptom.find((h) => h.kind === "guide" && h.slug === "rough-idle");
    expect(guide?.relatedCodes).toContain("P0300");
    expect(symptom.some((h) => h.kind === "dtc")).toBe(true);
  });
});

describe("providers", () => {
  it("contract-only vendors are 'not_configured' and never called", async () => {
    for (const id of ["autodata", "tecrmi", "tecalliance_cn", "carsxe"] as const) {
      expect((await providerStatus(id)).state).toBe("not_configured");
      expect(await usageAllowed(id, "display")).toBe(false);
    }
  });

  it("license policy defaults deny embeddings/training; expiry flips the provider to license_expired", async () => {
    const db = await getDb();
    expect(await usageAllowed("nhtsa_vpic", "training")).toBe(false);
    await db.update(dataProviders).set({ status: "active" }).where(eq(dataProviders.id, "nhtsa_vpic"));
    process.env.PROVIDER_NHTSA_ENABLED = "true";
    const { resetEnvCache } = await import("@/server/config/env");
    resetEnvCache();
    expect((await providerStatus("nhtsa_vpic")).state).toBe("active");
    await db.update(licensePolicies).set({ validUntil: new Date(Date.now() - 1000) }).where(eq(licensePolicies.providerId, "nhtsa_vpic"));
    expect((await providerStatus("nhtsa_vpic")).state).toBe("license_expired");
    process.env.PROVIDER_NHTSA_ENABLED = "false";
    resetEnvCache();
    expect(nhtsaVpic.configured()).toBe(false);
  });

  it("surfaces a provider outage as provider_unavailable", async () => {
    await expect(mockTest.decodeVin("1HGCM82633A000000")).rejects.toBeInstanceOf(AppError);
  });

  it("does not retry 4xx, retries 5xx, honours 429 without hammering, and opens the circuit", async () => {
    let calls = 0;
    await expect(resilientCall({ provider: "t-4xx", retries: 3 }, async () => { calls++; throw new ProviderHttpError(400); })).rejects.toBeTruthy();
    expect(calls).toBe(1);
    calls = 0;
    await expect(resilientCall({ provider: "t-429", retries: 3 }, async () => { calls++; throw new ProviderHttpError(429, 30); })).rejects.toMatchObject({ code: "provider_unavailable", extra: { retryAfterSeconds: 30 } });
    expect(calls).toBe(1);
    calls = 0;
    await expect(resilientCall({ provider: "t-5xx", retries: 2 }, async () => { calls++; throw new ProviderHttpError(503); })).rejects.toBeTruthy();
    expect(calls).toBe(3);
    for (let i = 0; i < 5; i++) await resilientCall({ provider: "t-cb", retries: 0, failureThreshold: 3 }, async () => { throw new ProviderHttpError(500); }).catch(() => undefined);
    calls = 0;
    await expect(resilientCall({ provider: "t-cb", retries: 0 }, async () => { calls++; return 1; })).rejects.toMatchObject({ message: "circuit_open" });
    expect(calls).toBe(0);
  });
});
