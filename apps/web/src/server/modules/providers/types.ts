/**
 * Unified provider contracts. Each capability is an optional interface so an
 * adapter only implements what the vendor actually offers. Nothing here
 * assumes a vendor schema — adapters map documented responses into these.
 */

export type ProviderId = "nhtsa_vpic" | "nhtsa_recalls" | "oem_licensed" | "carsxe" | "autodata" | "tecrmi" | "tecalliance_cn" | "internal_curated" | "mock_test";
export type Capability = "vin_decode" | "dtc_lookup" | "repair_data" | "fitment" | "maintenance_schedule" | "recalls" | "model_catalog";
export type ProviderState = "active" | "not_configured" | "disabled" | "license_expired" | "test_only";

export interface VinDecodeResult {
  make: string | null;
  model: string | null;
  modelYear: number | null;
  engine: string | null;
  displacementL: number | null;
  cylinders: number | null;
  fuel: string | null;
  transmission: string | null;
  trim: string | null;
  bodyClass: string | null;
  /** Vendor diagnostic, e.g. vPIC "6 - Incomplete VIN". */
  warnings: string[];
  raw: Record<string, string>;
}

export interface ProviderDtcResult {
  code: string;
  description: string;
  language: string;
  fetchedAt: Date;
  externalRef?: string;
}

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  capabilities: Capability[];
  docsUrl: string;
  /** Static configuration state (keys present?). License state is checked separately. */
  configured: () => boolean;
  /** For contract-only vendors: credentials were supplied but the adapter is not implemented yet. */
  credentialsPresent?: () => boolean;
  /** What we could verify about the vendor's public documentation. */
  docsNote: string;
}

export interface VinDecoder {
  decodeVin(vin: string, modelYear?: number): Promise<VinDecodeResult>;
}
export interface RecallRecord {
  campaignNumber: string;
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  /** ISO date (converted from NHTSA's DD/MM/YYYY). */
  reportReceivedDate: string | null;
  parkIt: boolean;
  parkOutside: boolean;
  overTheAirUpdate: boolean;
}
export interface RecallProvider {
  recallsByVehicle(make: string, model: string, modelYear: number): Promise<RecallRecord[]>;
}
export interface ModelCatalog {
  modelsForMakeYear(make: string, modelYear: number): Promise<string[]>;
}
export interface DtcLookupProvider {
  lookupDtc(code: string): Promise<ProviderDtcResult | null>;
}
