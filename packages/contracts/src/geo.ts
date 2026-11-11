/**
 * Markets, regions and currencies. Iraq is the first market; adding a
 * country means adding an entry here plus delivery/payment configuration.
 */

export interface Region {
  code: string;
  ar: string;
  en: string;
}

export interface MarketConfig {
  country: string;
  currency: CurrencyCode;
  regions: Region[];
  paymentMethods: Array<"cod" | "test_gateway">;
  fulfilment: Array<"pickup" | "delivery">;
}

/**
 * Iraqi governorates. Halabja was approved by the Iraqi parliament as a
 * governorate in 2025; keep the list under review with the operations team.
 */
export const IQ_GOVERNORATES: Region[] = [
  { code: "BGD", ar: "بغداد", en: "Baghdad" },
  { code: "BSR", ar: "البصرة", en: "Basra" },
  { code: "NIN", ar: "نينوى", en: "Nineveh" },
  { code: "ERB", ar: "أربيل", en: "Erbil" },
  { code: "SUL", ar: "السليمانية", en: "Sulaymaniyah" },
  { code: "DUH", ar: "دهوك", en: "Duhok" },
  { code: "HLB", ar: "حلبجة", en: "Halabja" },
  { code: "KRK", ar: "كركوك", en: "Kirkuk" },
  { code: "ANB", ar: "الأنبار", en: "Anbar" },
  { code: "BBL", ar: "بابل", en: "Babil" },
  { code: "KRB", ar: "كربلاء", en: "Karbala" },
  { code: "NJF", ar: "النجف", en: "Najaf" },
  { code: "WST", ar: "واسط", en: "Wasit" },
  { code: "DYL", ar: "ديالى", en: "Diyala" },
  { code: "SLD", ar: "صلاح الدين", en: "Salah al-Din" },
  { code: "DHQ", ar: "ذي قار", en: "Dhi Qar" },
  { code: "MYS", ar: "ميسان", en: "Maysan" },
  { code: "MTH", ar: "المثنى", en: "Muthanna" },
  { code: "QDS", ar: "القادسية", en: "Al-Qadisiyah" },
];

export type CurrencyCode = "IQD" | "USD";

/**
 * Money is stored as integer minor units. IQD is configured with exponent 0
 * because fils are not in circulation (ISO 4217 lists 3); this is a recorded
 * decision (docs/DECISIONS.md D-011) and can be changed per currency.
 */
export const CURRENCIES: Record<CurrencyCode, { exponent: number; ar: string; en: string }> = {
  IQD: { exponent: 0, ar: "د.ع", en: "IQD" },
  USD: { exponent: 2, ar: "$", en: "USD" },
};

export const MARKETS: Record<string, MarketConfig> = {
  IQ: {
    country: "IQ",
    currency: "IQD",
    regions: IQ_GOVERNORATES,
    paymentMethods: ["cod", "test_gateway"],
    fulfilment: ["pickup", "delivery"],
  },
};

export const VEHICLE_SALES_MARKETS = ["IQ", "GCC", "US", "EU", "KR", "JP", "CN", "OTHER"] as const;
export type VehicleSalesMarket = (typeof VEHICLE_SALES_MARKETS)[number];

export function isRegionCode(country: string, code: string): boolean {
  return MARKETS[country]?.regions.some((r) => r.code === code) ?? false;
}

export function formatMoney(minor: number, currency: CurrencyCode, locale: "ar" | "en" = "ar"): string {
  const { exponent } = CURRENCIES[currency];
  const value = minor / 10 ** exponent;
  return new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(value);
}
