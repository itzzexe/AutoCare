import "server-only";
import { env, isProd } from "../../config/env";
import { AppError } from "../../lib/errors";
import { ProviderHttpError, providerFetch, resilientCall } from "./resilience";
import type { DtcLookupProvider, ModelCatalog, ProviderDtcResult, ProviderId, ProviderInfo, RecallProvider, RecallRecord, VinDecodeResult, VinDecoder } from "./types";

// ---------------------------------------------------------------------------
// NHTSA vPIC — public US government API, no key. Docs verified 2026-10-02:
// GET https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{VIN}?format=json&modelyear=YYYY
// Response: { Count, Message, SearchCriteria, Results: [ { Make, Model, ModelYear, ... } ] }
// All values are strings; "" means NHTSA has no data (not "feature absent").
// Coverage is strongest for vehicles sold in the US; Iraqi-market/GCC-spec
// vehicles may decode partially or not at all. The user must confirm.
// ---------------------------------------------------------------------------
const VPIC_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";

const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const num = (v: unknown) => {
  const s = str(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export function mapVpic(result: Record<string, string>): VinDecodeResult {
  const disp = num(result.DisplacementL);
  const warnings: string[] = [];
  const code = str(result.ErrorCode);
  if (code && code !== "0") warnings.push(str(result.ErrorText) ?? `vPIC error ${code}`);
  const engineParts = [disp ? `${disp.toFixed(1)}L` : null, str(result.EngineCylinders) ? `${result.EngineCylinders}cyl` : null, str(result.EngineModel)];
  return {
    make: str(result.Make),
    model: str(result.Model),
    modelYear: num(result.ModelYear),
    engine: engineParts.filter(Boolean).join(" ") || null,
    displacementL: disp ? Math.round(disp * 10) / 10 : null,
    cylinders: num(result.EngineCylinders),
    fuel: str(result.FuelTypePrimary),
    transmission: str(result.TransmissionStyle),
    trim: str(result.Trim),
    bodyClass: str(result.BodyClass),
    warnings,
    raw: Object.fromEntries(
      ["Make", "Model", "ModelYear", "Trim", "BodyClass", "DisplacementL", "EngineCylinders", "EngineModel", "FuelTypePrimary", "TransmissionStyle", "DriveType", "PlantCountry", "ErrorCode", "ErrorText"]
        .filter((k) => str(result[k]))
        .map((k) => [k, String(result[k])]),
    ),
  };
}

export const nhtsaVpic: ProviderInfo & VinDecoder & ModelCatalog = {
  id: "nhtsa_vpic",
  name: "NHTSA vPIC",
  capabilities: ["vin_decode", "model_catalog"],
  docsUrl: "https://vpic.nhtsa.dot.gov/api/",
  docsNote: "Public, free, no key. No published per-client quota; automated traffic control applies. No explicit data licence text found.",
  configured: () => env().PROVIDER_NHTSA_ENABLED,
  async decodeVin(vin, modelYear) {
    if (!this.configured()) throw new AppError("provider_not_configured");
    const url = `${VPIC_BASE}/DecodeVinValues/${encodeURIComponent(vin)}?format=json${modelYear ? `&modelyear=${modelYear}` : ""}`;
    return resilientCall({ provider: this.id, timeoutMs: 8_000, retries: 2 }, async (signal) => {
      const res = await providerFetch(url, { signal, headers: { accept: "application/json" } });
      const json = (await res.json()) as { Results?: Array<Record<string, string>> };
      const first = json.Results?.[0];
      if (!first) throw new AppError("provider_unavailable", "empty_response");
      return mapVpic(first);
    });
  },
  // GET /vehicles/GetModelsForMakeYear/make/{make}/modelyear/{year}?format=json (verified 2026-10-02)
  // -> { Count, Message, SearchCriteria, Results: [{ Make_ID, Make_Name, Model_ID, Model_Name }] }
  // modelyear must be an integer > 1995 per the docs.
  async modelsForMakeYear(make, modelYear) {
    if (!this.configured()) throw new AppError("provider_not_configured");
    if (modelYear <= 1995) return [];
    const url = `${VPIC_BASE}/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${modelYear}?format=json`;
    return resilientCall({ provider: this.id, timeoutMs: 8_000, retries: 1 }, async (signal) => {
      const res = await providerFetch(url, { signal, headers: { accept: "application/json" } });
      const json = (await res.json()) as { Results?: Array<{ Model_Name?: unknown }> };
      return [...new Set((json.Results ?? []).map((r) => str(r.Model_Name)).filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b)).slice(0, 300);
    });
  },
};

// ---------------------------------------------------------------------------
// NHTSA Recalls - public, no key. Verified 2026-10-02 with live calls:
// GET https://api.nhtsa.gov/recalls/recallsByVehicle?make=&model=&modelYear=
// -> { Count, Message, results: [{ NHTSACampaignNumber, Component, Summary, Consequence,
//      Remedy, Notes, ReportReceivedDate "DD/MM/YYYY", parkIt, parkOutSide, overTheAirUpdate, ... }] }
// An unknown model returns HTTP 400 with { Count: 0, results: [] }: "no data", not an outage.
// US-market campaigns only: Iraqi/GCC-spec vehicles may not be covered by them.
// ---------------------------------------------------------------------------
const RECALLS_BASE = "https://api.nhtsa.gov/recalls/recallsByVehicle";

export function parseDdMmYyyy(v: unknown): string | null {
  const s = str(v);
  const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(dd) || d.getUTCMonth() !== Number(mm) - 1 ? null : d.toISOString().slice(0, 10);
}

export function mapRecall(r: Record<string, unknown>): RecallRecord | null {
  const campaignNumber = str(r.NHTSACampaignNumber);
  if (!campaignNumber) return null;
  const clip = (v: unknown, n: number) => (str(v) ?? "").slice(0, n);
  return {
    campaignNumber,
    component: clip(r.Component, 300),
    summary: clip(r.Summary, 2000),
    consequence: clip(r.Consequence, 1500),
    remedy: clip(r.Remedy, 1500),
    reportReceivedDate: parseDdMmYyyy(r.ReportReceivedDate),
    parkIt: r.parkIt === true,
    parkOutside: r.parkOutSide === true,
    overTheAirUpdate: r.overTheAirUpdate === true,
  };
}

export const nhtsaRecalls: ProviderInfo & RecallProvider = {
  id: "nhtsa_recalls",
  name: "NHTSA Recalls API",
  capabilities: ["recalls"],
  docsUrl: "https://www.nhtsa.gov/nhtsa-datasets-and-apis",
  docsNote: "Public, free, no key, no documented quota. US-market recall campaigns only. No explicit licence text found.",
  configured: () => env().PROVIDER_NHTSA_ENABLED,
  async recallsByVehicle(make, model, modelYear) {
    if (!this.configured()) throw new AppError("provider_not_configured");
    const url = `${RECALLS_BASE}?${new URLSearchParams({ make, model, modelYear: String(modelYear) })}`;
    try {
      return await resilientCall({ provider: this.id, timeoutMs: 8_000, retries: 1 }, async (signal) => {
        const res = await providerFetch(url, { signal, headers: { accept: "application/json" } });
        const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
        return (json.results ?? []).map(mapRecall).filter((x): x is RecallRecord => x !== null).slice(0, 100);
      });
    } catch (e) {
      if (e instanceof ProviderHttpError && e.status === 400) return [];
      throw e;
    }
  },
};

// ---------------------------------------------------------------------------
// CarsXE OBD Codes Decoder — docs verified 2026-10-02:
// GET https://api.carsxe.com/obdcodesdecoder?key=KEY&code=P0115
// Response: { success: boolean, diagnosis: string, code: string, date: string }
// Errors: 400 missing code, 401 key, 404 unknown code, 429 usage limit.
// Terms page was placeholder text on 2026-10-02: usage rights NOT verified,
// so display stays blocked until an admin records a license policy.
// ---------------------------------------------------------------------------
export const carsxe: ProviderInfo & DtcLookupProvider = {
  id: "carsxe",
  name: "CarsXE OBD Codes Decoder",
  capabilities: ["dtc_lookup"],
  docsUrl: "https://docs.carsxe.com/docs/products/obd-codes-decoder",
  docsNote: "Key in query string; generic OBD-II codes. Public pricing exists; terms page was placeholder at check time.",
  configured: () => Boolean(env().PROVIDER_CARSXE_API_KEY),
  async lookupDtc(code): Promise<ProviderDtcResult | null> {
    if (!this.configured()) throw new AppError("provider_not_configured");
    const url = `https://api.carsxe.com/obdcodesdecoder?key=${encodeURIComponent(env().PROVIDER_CARSXE_API_KEY!)}&code=${encodeURIComponent(code)}`;
    try {
      return await resilientCall({ provider: this.id, timeoutMs: 6_000, retries: 1 }, async (signal) => {
        const res = await providerFetch(url, { signal, headers: { accept: "application/json" } });
        const json = (await res.json()) as { success?: boolean; diagnosis?: string; code?: string };
        if (!json.success || !json.diagnosis) return null;
        return { code: json.code ?? code, description: json.diagnosis.slice(0, 500), language: "en", fetchedAt: new Date() };
      });
    } catch (e) {
      // 404 = code not in the provider's table: a legitimate "no data" answer.
      if (e instanceof Error && "status" in e && (e as { status: number }).status === 404) return null;
      throw e;
    }
  },
};

// ---------------------------------------------------------------------------
// Contract-only vendors. Public docs do not expose endpoints/auth details
// (Autodata, TecRMI) or require a customer key (TecAlliance CN). These
// adapters expose configuration state only and refuse calls; no endpoint or
// schema is invented. See docs/DATA_SOURCES.md for what each vendor publishes.
// ---------------------------------------------------------------------------
function contractOnly(id: ProviderId, name: string, capabilities: ProviderInfo["capabilities"], docsUrl: string, docsNote: string, keyPresent: () => boolean): ProviderInfo {
  // Never 'configured': the integration is not implemented until the contract and docs are available.
  return { id, name, capabilities, docsUrl, docsNote, configured: () => false, credentialsPresent: keyPresent };
}

export const autodata = contractOnly(
  "autodata", "Autodata API", ["repair_data", "maintenance_schedule"],
  "https://www.autodata-group.com/uk/what-we-do/autodata-api/",
  "Developer docs behind login; OAuth 2.0 via TIBCO Mashery per public page. Pricing/terms not public. Integration requires a contract.",
  () => Boolean(env().PROVIDER_AUTODATA_CLIENT_ID && env().PROVIDER_AUTODATA_CLIENT_SECRET),
);
export const tecrmi = contractOnly(
  "tecrmi", "TecAlliance TecRMI", ["repair_data", "maintenance_schedule"],
  "https://www.tecalliance.net/solutions/tecrmi",
  "No public developer documentation; contact TecAlliance. DTC content not confirmed publicly.",
  () => Boolean(env().PROVIDER_TECRMI_API_KEY),
);
export const tecallianceCn = contractOnly(
  "tecalliance_cn", "TecAlliance China (OneDB / ChinaID / TecDoc)", ["vin_decode", "fitment"],
  "https://developer.tecalliance.cn/en/introduction/",
  "Customer-only OneDB API key. Public examples document VIN→KType and TecDoc vehicle search; auth placement differs between pages (header vs body token) and must be confirmed with TecAlliance.",
  () => Boolean(env().PROVIDER_TECALLIANCE_CN_API_KEY),
);

/**
 * Manufacturer-specific code data that the operator has LICENSED (OEM service
 * data, Autodata/TecRMI exports, etc.) and imports with `pnpm kb:import`.
 * Nothing is served unless an admin recorded a licence policy allowing display.
 */
export const oemLicensed: ProviderInfo = {
  id: "oem_licensed",
  name: "Licensed manufacturer code data (imported)",
  capabilities: ["dtc_lookup"],
  docsUrl: "docs/DATA_IMPORT.md",
  docsNote: "Operator-supplied licensed datasets. Display/cache/embedding rights come only from the recorded licence policy.",
  configured: () => true,
};

export const internalCurated: ProviderInfo = {
  id: "internal_curated",
  name: "AutoCare editorial knowledge base",
  capabilities: ["dtc_lookup"],
  docsUrl: "docs/DATA_SOURCES.md",
  docsNote: "Project-authored definitions. Every entry carries a review status; drafts are labelled as unreviewed.",
  configured: () => true,
};

/** Fixture provider for automated tests. Refused outside test/dev with explicit flag. */
export const mockTest: ProviderInfo & VinDecoder & DtcLookupProvider = {
  id: "mock_test",
  name: "Test fixtures (not real data)",
  capabilities: ["vin_decode", "dtc_lookup"],
  docsUrl: "",
  docsNote: "Deterministic fixtures for tests only.",
  configured: () => env().ENABLE_MOCK_PROVIDERS && !isProd(),
  async decodeVin(vin) {
    if (!this.configured()) throw new AppError("provider_not_configured");
    if (vin.endsWith("00000")) throw new AppError("provider_unavailable", "fixture_outage");
    return { make: "TESTMAKE", model: "Fixture", modelYear: 2018, engine: "2.0L 4cyl", displacementL: 2, cylinders: 4, fuel: "Gasoline", transmission: "Automatic", trim: null, bodyClass: null, warnings: ["fixture"], raw: {} };
  },
  async lookupDtc(code) {
    if (!this.configured()) throw new AppError("provider_not_configured");
    if (code === "P0300") return { code, description: "Random/Multiple Cylinder Misfire Detected (fixture)", language: "en", fetchedAt: new Date() };
    if (code === "P0171") return { code, description: "Fuel trim lean condition — fixture wording that intentionally differs", language: "en", fetchedAt: new Date() };
    return null;
  },
};

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  nhtsa_vpic: nhtsaVpic,
  nhtsa_recalls: nhtsaRecalls,
  oem_licensed: oemLicensed,
  carsxe,
  autodata,
  tecrmi,
  tecalliance_cn: tecallianceCn,
  internal_curated: internalCurated,
  mock_test: mockTest,
};
