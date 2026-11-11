import Link from "next/link";
import { IQ_GOVERNORATES } from "@autocare/contracts";
import { Container, Empty, PageHeader, Stamp } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { currentAuth } from "@/server/http/session";
import { directory } from "@/server/modules/workshops/service";

export const metadata = { title: "الورش" };
const SPECIALTIES = ["engine", "transmission", "electrical", "ac", "brakes", "suspension", "body", "hybrid_ev", "diagnostics", "tyres"] as const;

export default async function WorkshopsPage({ searchParams }: { searchParams: Promise<{ gov?: string; specialty?: string; brand?: string }> }) {
  const sp = await searchParams;
  const { t, locale } = await getDict();
  const auth = await currentAuth();
  const gov = IQ_GOVERNORATES.some((g) => g.code === sp.gov) ? sp.gov : undefined;
  const specialty = SPECIALTIES.includes(sp.specialty as (typeof SPECIALTIES)[number]) ? sp.specialty : undefined;
  const brand = sp.brand?.trim().slice(0, 40) || undefined;
  const list = await directory({ governorate: gov, specialty, brand });
  const govName = (c: string) => IQ_GOVERNORATES.find((g) => g.code === c)?.[locale] ?? c;

  return (
    <Container>
      <PageHeader title={t.workshops.title} lead={t.workshops.lead} actions={auth ? <Link href="/workshops/appointments" className="btn">{t.workshops.appointments}</Link> : null} />
      <form method="get" className="ticket mb-8 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="wg" className="field-label">{t.market.governorate}</label>
          <select id="wg" name="gov" defaultValue={gov ?? ""} className="field">
            <option value="">{t.market.anyGov}</option>
            {IQ_GOVERNORATES.map((g) => <option key={g.code} value={g.code}>{locale === "ar" ? g.ar : g.en}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ws" className="field-label">{t.workshops.specialty}</label>
          <select id="ws" name="specialty" defaultValue={specialty ?? ""} className="field">
            <option value="">—</option>
            {SPECIALTIES.map((s) => <option key={s} value={s}>{t.workshops.specialties[s]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="wb" className="field-label">{t.workshops.brand}</label>
          <input id="wb" name="brand" defaultValue={brand} maxLength={40} className="field" placeholder="Toyota" />
        </div>
        <button className="btn btn-primary">{t.home.submit}</button>
      </form>
      {list.some((w) => w.featured) ? (
        <section aria-labelledby="featured-h" className="mb-8 border-2 border-dashed border-signal p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="featured-h" className="label-mono text-signal">{t.billing.featuredBlock}</h2>
            <p className="text-xs text-ink-3">{t.billing.featuredNote}</p>
          </div>
          <ul className="grid gap-3 md:grid-cols-3">
            {list.filter((w) => w.featured).slice(0, 3).map((w) => (
              <li key={w.id}>
                <Link href={`/workshops/${w.id}`} className="ticket group block h-full p-4">
                  <p className="font-bold group-hover:text-signal">{w.name}</p>
                  <p className="text-xs text-ink-3">{govName(w.governorate)} · {w.city}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {list.length === 0 ? (
        <Empty>{t.common.empty}</Empty>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2">
          {list.map((w) => (
            <li key={w.id}>
              <Link href={`/workshops/${w.id}`} className="ticket group block h-full">
                <div className="ticket-head"><span>{govName(w.governorate)} · {w.city}</span><span>{w.rating ? `★ ${w.rating.avg.toFixed(1)} (${w.rating.n})` : t.workshops.noRating}</span></div>
                <div className="space-y-3 p-5">
                  <p className="text-xl font-bold group-hover:text-signal">{w.name}</p>
                  <p className="text-sm text-ink-2">{w.address}</p>
                  <div className="flex flex-wrap gap-1.5">{w.specialties.map((s) => <Stamp key={s} tone="info">{t.workshops.specialties[s as keyof typeof t.workshops.specialties] ?? s}</Stamp>)}</div>
                  {w.brands.length ? <p className="text-xs text-ink-3" dir="ltr">{w.brands.join(" · ")}</p> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
