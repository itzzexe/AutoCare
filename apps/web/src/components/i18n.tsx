"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Dict } from "@/i18n/ar";

const Ctx = createContext<{ t: Dict; locale: "ar" | "en" } | null>(null);

export function I18nProvider({ t, locale, children }: { t: Dict; locale: "ar" | "en"; children: ReactNode }) {
  return <Ctx.Provider value={{ t, locale }}>{children}</Ctx.Provider>;
}

export function useT() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useT outside I18nProvider");
  return v;
}

/** Map an API error code to a localised message. */
export function errorText(t: Dict, code: string, message?: string): string {
  const e = t.errors as Record<string, string>;
  return e[message ?? ""] ?? e[code] ?? t.errors.generic;
}
