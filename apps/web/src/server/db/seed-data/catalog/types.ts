/**
 * One row of the generic code catalogue:
 *   [code, standard generic English title (SAE J2012 wording), Arabic title, template key, optional safety override]
 * Only GENERIC ranges are allowed: P0xxx, P2xxx, P34xx, B0xxx, C0xxx, U0xxx.
 * Manufacturer ranges (P1xxx, P30xx–P33xx, B1/B2, C1/C2, U1/U2) must come from a
 * licensed import (`pnpm kb:import`), never from this catalogue.
 */
export type CatalogRow = [code: string, en: string, ar: string, template: string, safety?: "brakes" | "steering" | "airbag" | "fuel" | "high_voltage"];

export const GENERIC_CODE_RE = /^(P0[0-9A-F]{3}|P2[0-9A-F]{3}|P34[0-9A-F]{2}|B0[0-9A-F]{3}|C0[0-9A-F]{3}|U0[0-9A-F]{3})$/;
