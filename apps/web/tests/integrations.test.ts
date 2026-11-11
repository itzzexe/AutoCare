import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/server/config/env";
import { mapRecall, nhtsaRecalls, nhtsaVpic, parseDdMmYyyy } from "@/server/modules/providers/adapters";
import { resetBreakers } from "@/server/modules/providers/resilience";
import { clearExternalCache, modelSuggestions, vehicleRecalls } from "@/server/modules/vehicles/external";
import { createVehicle } from "@/server/modules/vehicles/service";
import { freshDb, makeUser } from "./support/db";

// Response shapes copied from live calls made on 2026-10-02 (trimmed).
const RECALLS_OK = {
  Count: 1,
  Message: "Results returned successfully",
  results: [
    {
      Manufacturer: "Honda (American Honda Motor Co.)", NHTSACampaignNumber: "18V661000", parkIt: false, parkOutSide: false, overTheAirUpdate: false,
      NHTSAActionNumber: "EA15001", ReportReceivedDate: "27/09/2018", Component: "AIR BAGS:FRONTAL:PASSENGER SIDE:INFLATOR MODULE",
      Summary: "Honda is recalling ...", Consequence: "An inflator explosion may result in ...", Remedy: "Dealers will replace ...", Notes: "Owners may also contact ...",
      ModelYear: "2012", Make: "HONDA", Model: "ACCORD",
    },
  ],
};
const RECALLS_UNKNOWN_MODEL = { Count: 0, Message: "Results returned successfully", results: [] };
const MODELS_OK = {
  Count: 3, Message: "Results returned successfully", SearchCriteria: "Make:toyota | ModelYear:2015",
  Results: [
    { Make_ID: 448, Make_Name: "TOYOTA", Model_ID: 2208, Model_Name: "Corolla" },
    { Make_ID: 448, Make_Name: "TOYOTA", Model_ID: 2469, Model_Name: "Camry" },
    { Make_ID: 448, Make_Name: "TOYOTA", Model_ID: 2208, Model_Name: "Corolla" },
  ],
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function enableNhtsa(on: boolean) {
  process.env.PROVIDER_NHTSA_ENABLED = on ? "true" : "false";
  resetEnvCache();
}

beforeAll(async () => {
  await freshDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
  enableNhtsa(false);
  clearExternalCache();
  resetBreakers();
});

describe("NHTSA recalls adapter", () => {
  it("converts DD/MM/YYYY and rejects impossible dates", () => {
    expect(parseDdMmYyyy("27/09/2018")).toBe("2018-09-27");
    expect(parseDdMmYyyy("31/02/2020")).toBeNull();
    expect(parseDdMmYyyy("09/27/2018")).toBeNull();
    expect(parseDdMmYyyy("")).toBeNull();
  });

  it("maps documented fields and tolerates missing optional ones", () => {
    const r = mapRecall(RECALLS_OK.results[0]!)!;
    expect(r).toMatchObject({ campaignNumber: "18V661000", reportReceivedDate: "2018-09-27", parkIt: false, component: expect.stringContaining("AIR BAGS") });
    expect(mapRecall({ Summary: "no campaign number" })).toBeNull();
  });

  it("refuses to call when not configured", async () => {
    await expect(nhtsaRecalls.recallsByVehicle("Honda", "Accord", 2012)).rejects.toMatchObject({ code: "provider_not_configured" });
  });

  it("treats NHTSA's HTTP 400 for an unknown model as 'no recalls', not an outage", async () => {
    enableNhtsa(true);
    const f = vi.fn(async () => json(400, RECALLS_UNKNOWN_MODEL));
    vi.stubGlobal("fetch", f);
    await expect(nhtsaRecalls.recallsByVehicle("Honda", "NoSuchModel", 2012)).resolves.toEqual([]);
    const url = new URL(String((f.mock.calls[0] as unknown[])[0]));
    expect(url.origin + url.pathname).toBe("https://api.nhtsa.gov/recalls/recallsByVehicle");
    expect(url.searchParams.get("modelYear")).toBe("2012");
  });
});

describe("vehicle recalls service", () => {
  it("reports not_configured instead of an empty 'no recalls' answer", async () => {
    const u = await makeUser();
    const v = await createVehicle(u.id, { make: "Honda", model: "Accord", year: 2012, fuel: "petrol", transmission: "automatic", salesMarket: "US", odometerUnit: "km" });
    const r = await vehicleRecalls(u.id, v.id);
    expect(r.status).toBe("not_configured");
  });

  it("returns campaigns, caches them, and reports outages honestly", async () => {
    enableNhtsa(true);
    const u = await makeUser();
    const v = await createVehicle(u.id, { make: "Honda", model: "Accord", year: 2012, fuel: "petrol", transmission: "automatic", salesMarket: "US", odometerUnit: "km" });
    const f = vi.fn(async () => json(200, RECALLS_OK));
    vi.stubGlobal("fetch", f);
    const r1 = await vehicleRecalls(u.id, v.id);
    expect(r1).toMatchObject({ status: "ok", market: "US" });
    expect(r1.recalls.map((x) => x.campaignNumber)).toEqual(["18V661000"]);
    await vehicleRecalls(u.id, v.id);
    expect(f).toHaveBeenCalledTimes(1);

    clearExternalCache();
    vi.stubGlobal("fetch", vi.fn(async () => json(503, {})));
    const r2 = await vehicleRecalls(u.id, v.id);
    expect(r2.status).toBe("unavailable");
  });

  it("never exposes another user's vehicle", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const v = await createVehicle(a.id, { make: "Honda", model: "Accord", year: 2012, fuel: "petrol", transmission: "automatic", salesMarket: "US", odometerUnit: "km" });
    await expect(vehicleRecalls(b.id, v.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("vPIC model suggestions", () => {
  it("de-duplicates and sorts model names", async () => {
    enableNhtsa(true);
    const f = vi.fn(async () => json(200, MODELS_OK));
    vi.stubGlobal("fetch", f);
    const r = await modelSuggestions("Toyota", 2015);
    expect(r).toEqual({ provider: "nhtsa_vpic", status: "ok", models: ["Camry", "Corolla"] });
    expect(String((f.mock.calls[0] as unknown[])[0])).toBe("https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/Toyota/modelyear/2015?format=json");
  });

  it("does not call vPIC for model years the API rejects", async () => {
    enableNhtsa(true);
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(nhtsaVpic.modelsForMakeYear("Toyota", 1990)).resolves.toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});
