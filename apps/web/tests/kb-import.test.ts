import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { licensePolicies } from "@/server/db/schema";
import { lookupDtc } from "@/server/modules/knowledge/dtc-service";
import { importManufacturerDtcs, parseCsv, recordDemand, topDemand } from "@/server/modules/knowledge/importer";
import { freshDb } from "./support/db";

// Fixture rows are obviously synthetic test data (not real manufacturer content).
const CSV = [
  "code,make,model,yearFrom,yearTo,engine,market,module,titleEn,titleAr,meaningEn,meaningAr,symptoms,causes,fixes,skillLevel,safetyArea,baseUrgency",
  'P1999,Testmake,Alpha,2015,2019,,,,"Fixture code, quoted title","تعريف تجريبي","Fixture meaning",,"sym one|sym two","cause one",fix one,workshop,none,soon',
  "P1999,Testmake,Alpha,2015,2019,,,,Duplicate row,,Duplicate meaning,,,,,,,",
  "XYZ,Testmake,,,,,,,Bad code,,Bad,,,,,,,",
  "P1998,Testmake,,2020,2010,,,,Bad years,,Bad years,,,,,,,",
].join("\r\n");
const meta = { sourceTitle: "Fixture licensed export", sourceVersion: "fx-2026-10", licenceRef: "TEST-CONTRACT-1" };

beforeAll(async () => {
  await freshDb();
});

describe("licensed manufacturer import", () => {
  it("parses quoted CSV fields and CRLF", () => {
    const rows = parseCsv(CSV);
    expect(rows).toHaveLength(4);
    expect(rows[0]!.titleEn).toBe("Fixture code, quoted title");
  });

  it("refuses without a recorded licence policy (default deny)", async () => {
    await expect(importManufacturerDtcs(parseCsv(CSV), meta)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("imports valid rows with applicability, rejects bad ones, skips duplicates, and lookup honours the vehicle", async () => {
    const db = await getDb();
    await db.insert(licensePolicies).values({ providerId: "oem_licensed", version: "fx", allowDisplay: true, allowCache: true, cacheTtlSeconds: 0, allowTranslation: false, allowOffline: false, allowEmbeddings: false, allowTraining: false, allowRedistribution: false, validFrom: new Date(Date.now() - 1000), agreementRef: "TEST-CONTRACT-1" });
    const dry = await importManufacturerDtcs(parseCsv(CSV), meta, { dryRun: true });
    expect(dry).toMatchObject({ dryRun: true, imported: 2 });

    const r = await importManufacturerDtcs(parseCsv(CSV), meta);
    expect(r.imported).toBe(1);
    expect(r.skippedDuplicates).toBe(1);
    expect(r.errors.map((e) => e.line)).toEqual([4, 5]);

    const match = await lookupDtc("P1999", { make: "Testmake", model: "Alpha", year: 2017 });
    expect(match?.status).toBe("covered");
    expect(match?.definitions[0]?.titleEn).toBe("Fixture code, quoted title");
    expect((await lookupDtc("P1999", { make: "Testmake", model: "Alpha", year: 2022 }))?.status).toBe("make_only");
    expect((await lookupDtc("P1999", { make: "Othermake", model: "X", year: 2017 }))?.status).not.toBe("covered");
    expect((await lookupDtc("P1999"))?.status).toBe("needs_vehicle");
  });
});

describe("demand counter", () => {
  it("counts uncovered manufacturer codes per make without any user data", async () => {
    await recordDemand("P1A2B", "Kia");
    await recordDemand("P1A2B", "Kia");
    await recordDemand("P1A2B", "Hyundai");
    const top = await topDemand(10);
    expect(top.find((d) => d.code === "P1A2B" && d.make === "Kia")?.count).toBe(2);
    expect(Object.keys(top[0]!).sort()).toEqual(["code", "count", "lastAt", "make"]);
  });
});
