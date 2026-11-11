import "server-only";
import { cookies } from "next/headers";
import { ar, type Dict } from "./ar";
import { en } from "./en";

export type Locale = "ar" | "en";
export const LOCALE_COOKIE = "acq_locale";

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return v === "en" ? "en" : "ar";
}

export async function getDict(): Promise<{ locale: Locale; t: Dict; dir: "rtl" | "ltr" }> {
  const locale = await getLocale();
  return { locale, t: locale === "en" ? en : (ar as unknown as Dict), dir: locale === "en" ? "ltr" : "rtl" };
}
