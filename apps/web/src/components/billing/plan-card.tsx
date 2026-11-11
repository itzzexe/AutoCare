import type { ReactNode } from "react";
import { formatMoney, type CurrencyCode } from "@autocare/contracts";
import type { Dict } from "@/i18n/ar";
import type { PlanEntitlements } from "@/server/db/schema/billing";
import { Stamp } from "../ui/bits";
import { Icon } from "../ui/icon";

export interface PlanView {
  id: string;
  audience: "owner" | "workshop" | "merchant";
  tier: "free" | "paid";
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  priceMinor: number | null;
  currency: string;
  periodDays: number;
  entitlements: PlanEntitlements;
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

export function entitlementLines(e: PlanView["entitlements"], t: Dict, locale: "ar" | "en"): string[] {
  const n = (v: number) => v.toLocaleString(locale === "ar" ? "ar-IQ" : "en");
  const out: string[] = [];
  if (typeof e.maxVehicles === "number") out.push(fill(t.billing.ent.maxVehicles, { n: n(e.maxVehicles) }));
  if (typeof e.aiExplanationsPerMonth === "number") out.push(fill(t.billing.ent.aiExplanationsPerMonth, { n: n(e.aiExplanationsPerMonth) }));
  if (e.featuredListing) out.push(t.billing.ent.featuredListing);
  if (typeof e.sponsoredProducts === "number" && e.sponsoredProducts > 0) out.push(fill(t.billing.ent.sponsoredProducts, { n: n(e.sponsoredProducts) }));
  if (typeof e.commissionBps === "number") out.push(fill(t.billing.ent.commissionBps, { pct: (e.commissionBps / 100).toLocaleString(locale === "ar" ? "ar-IQ" : "en", { maximumFractionDigits: 2 }) }));
  if (typeof e.offerResponsesPerMonth === "number") out.push(fill(t.billing.ent.offerResponsesPerMonth, { n: n(e.offerResponsesPerMonth) }));
  if (e.analytics) out.push(t.billing.ent.analytics);
  return out;
}

export function PlanCard({ p, t, locale, current = false, action }: { p: PlanView; t: Dict; locale: "ar" | "en"; current?: boolean; action?: ReactNode }) {
  const paid = p.tier === "paid";
  return (
    <article className={`ticket relative flex h-full flex-col overflow-hidden ${paid ? "border-2 border-ink" : ""}`}>
      {paid ? <div className="hazard" aria-hidden="true" /> : null}
      <div className="ticket-head">
        <span>{t.billing.audience[p.audience]}</span>
        <span dir="ltr">{p.id.toUpperCase()}</span>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-2xl font-bold">{locale === "ar" ? p.nameAr : p.nameEn}</h3>
          {current ? <Stamp tone="ok">{t.billing.current}</Stamp> : null}
        </div>
        <div>
          {p.tier === "free" ? (
            <>
              <p className="font-display text-4xl font-bold">{formatMoney(0, p.currency as CurrencyCode, locale)}</p>
              <p className="label-mono mt-1">{t.billing.free}</p>
            </>
          ) : p.priceMinor ? (
            <>
              <p className="font-display text-4xl font-bold">{formatMoney(p.priceMinor, p.currency as CurrencyCode, locale)}</p>
              <p className="label-mono mt-1">{fill(t.billing.perPeriod, { days: p.periodDays })}</p>
            </>
          ) : (
            <p className="text-ink-3">{t.billing.priceNotSet}</p>
          )}
        </div>
        <p className="text-sm text-ink-2">{locale === "ar" ? p.descriptionAr : p.descriptionEn}</p>
        <ul className="space-y-1.5 text-sm">
          {entitlementLines(p.entitlements, t, locale).map((l) => (
            <li key={l} className="flex gap-2"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-ok" />{l}</li>
          ))}
        </ul>
        {action ? <div className="mt-auto pt-2">{action}</div> : null}
      </div>
    </article>
  );
}
