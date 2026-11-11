import Link from "next/link";
import { formatMoney, type CurrencyCode } from "@autocare/contracts";
import type { Dict } from "@/i18n/ar";
import type { CatalogItem } from "@/server/modules/market/service";
import { Ltr, Stamp } from "./ui/bits";

const fitTone = { compatible_per_source: "ok", seller_claim: "warn", needs_confirmation: "neutral" } as const;

export function ProductCard({ p, t, locale, vehicleId }: { p: CatalogItem; t: Dict; locale: "ar" | "en"; vehicleId?: string }) {
  return (
    <Link href={`/market/${p.id}${vehicleId ? `?vehicleId=${vehicleId}` : ""}`} className="ticket group flex h-full flex-col">
      <div className="ticket-head">
        <span>{p.merchant.name}</span>
        {p.sponsored ? <span className="text-signal">{t.market.sponsored}</span> : <span>{p.category}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-lg font-bold leading-snug group-hover:text-signal">{locale === "ar" ? p.titleAr : p.titleEn ?? p.titleAr}</p>
          <p className="text-sm text-ink-3">{p.brand}</p>
        </div>
        {p.oeNumbers.length ? <p className="text-xs"><span className="text-ink-3">OE </span><Ltr>{p.oeNumbers.slice(0, 2).join(" · ")}</Ltr></p> : null}
        <div className="flex flex-wrap gap-1.5">
          <Stamp tone={fitTone[p.fitment]}>{t.market.fitment[p.fitment]}</Stamp>
          <Stamp tone="neutral">{t.market.condition[p.condition as keyof typeof t.market.condition]}</Stamp>
          {p.authenticityVerified ? <Stamp tone="ok">{t.market.verifiedOriginal}</Stamp> : null}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 border-t border-dashed border-rule pt-3">
          <span className="text-xl font-bold">{formatMoney(p.priceMinor, p.currency as CurrencyCode, locale)}</span>
          <span className={`text-xs ${p.inStock ? "text-ok" : "text-danger"}`}>{p.inStock ? t.market.inStock : t.market.outOfStock}</span>
        </div>
      </div>
    </Link>
  );
}
