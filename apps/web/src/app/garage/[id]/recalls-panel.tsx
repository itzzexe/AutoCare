import type { Dict } from "@/i18n/ar";
import { Ltr, Notice, Stamp, fmtDate } from "@/components/ui/bits";
import { vehicleRecalls } from "@/server/modules/vehicles/external";

/** Server component: streamed in under Suspense so a slow provider never blocks the vehicle page. */
export async function RecallsPanel({ userId, vehicleId, t, locale }: { userId: string; vehicleId: string; t: Dict; locale: "ar" | "en" }) {
  const r = await vehicleRecalls(userId, vehicleId);
  if (r.status === "not_configured") return null;
  return (
    <section className="ticket lg:col-span-2">
      <div className="ticket-head">
        <span>{t.garage.recallsTitle}</span>
        <span dir="ltr">NHTSA · {r.market}</span>
      </div>
      <div className="space-y-4 p-5">
        <Notice tone="info">{t.garage.recallsCaveat}</Notice>
        {r.status === "unavailable" ? <Notice tone="warn">{t.garage.recallsUnavailable}</Notice> : null}
        {r.status === "ok" && r.recalls.length === 0 ? <p className="text-sm text-ink-2">{t.garage.recallsNone}</p> : null}
        {r.recalls.length ? (
          <ul className="divide-y divide-dashed divide-rule border-y border-rule">
            {r.recalls.map((x) => (
              <li key={x.campaignNumber} className="py-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Ltr className="font-mono text-sm font-semibold">{x.campaignNumber}</Ltr>
                  {x.reportReceivedDate ? <span className="text-xs text-ink-3">{fmtDate(x.reportReceivedDate, locale)}</span> : null}
                  {x.parkIt ? <Stamp tone="danger">{t.garage.recallParkIt}</Stamp> : null}
                  {x.parkOutside ? <Stamp tone="danger">{t.garage.recallParkOutside}</Stamp> : null}
                  {x.overTheAirUpdate ? <Stamp tone="info">{t.garage.recallOta}</Stamp> : null}
                </div>
                <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[7rem_1fr]" dir="ltr">
                  <dt className="text-ink-3" dir="auto">{t.garage.recallComponent}</dt><dd className="text-start">{x.component}</dd>
                  <dt className="text-ink-3" dir="auto">{t.garage.recallConsequence}</dt><dd className="text-start">{x.consequence}</dd>
                  <dt className="text-ink-3" dir="auto">{t.garage.recallRemedy}</dt><dd className="text-start">{x.remedy}</dd>
                </dl>
              </li>
            ))}
          </ul>
        ) : null}
        {r.recalls.length ? <p className="text-xs text-ink-3">{t.garage.recallEnglish}</p> : null}
      </div>
    </section>
  );
}
