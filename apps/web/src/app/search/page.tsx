import Link from "next/link";
import { Suspense } from "react";
import { looksLikeDtcQuery } from "@autocare/contracts";
import { DtcView } from "@/components/dtc-view";
import { SearchBox } from "@/components/search-box";
import { Container, Empty, Ltr, Stamp } from "@/components/ui/bits";
import { VehiclePicker } from "@/components/vehicle-picker";
import { getDict } from "@/i18n/server";
import { currentAuth } from "@/server/http/session";
import { rateLimit } from "@/server/lib/rate-limit";
import { lookupDtc, textSearch } from "@/server/modules/knowledge/dtc-service";
import { getOwnedVehicle, listVehicles } from "@/server/modules/vehicles/service";
import { clientIp } from "@/server/lib/request";
import { AppError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import { headers } from "next/headers";

export const metadata = { title: "بحث" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; vehicleId?: string }> }) {
  const { q = "", vehicleId } = await searchParams;
  const { t, locale } = await getDict();
  const auth = await currentAuth();
  const query = q.trim().slice(0, 200);
  const vehicles = auth ? await listVehicles(auth.user.id) : [];
  const vehicle = auth && vehicleId && /^[0-9a-f-]{36}$/.test(vehicleId) ? await getOwnedVehicle(auth.user.id, vehicleId).catch(() => null) : null;

  let code = null;
  let text: Awaited<ReturnType<typeof textSearch>> = [];
  let limited = false;
  let failed = false;
  if (query) {
    try {
      await rateLimit("search:ip", clientIp(await headers()));
      const vctx = vehicle ? { make: vehicle.make, model: vehicle.model, year: vehicle.year, engine: vehicle.engine, market: vehicle.salesMarket } : undefined;
      code = looksLikeDtcQuery(query) ? await lookupDtc(query, vctx) : null;
      text = await textSearch(query, 10);
    } catch (e) {
      // Only a real rate-limit answer is shown as "too many requests"; anything else is logged
      // and shown as a generic error, so real faults are never disguised as throttling.
      if (e instanceof AppError && e.code === "rate_limited") limited = true;
      else {
        failed = true;
        logger.error({ err: (e as Error).message, stack: (e as Error).stack?.split(String.fromCharCode(10)).slice(0, 4).join(" | ") }, "search page failed");
      }
    }
  }

  return (
    <Container>
      <h1 className="sr-only">{t.search.title}</h1>
      <div className="mb-6 max-w-3xl">
        <SearchBox initial={query} size="md" vehicleId={vehicle?.id} />
      </div>
      <Suspense>
        <div className="mb-8">
          <VehiclePicker vehicles={vehicles.map((v) => ({ id: v.id, label: `${v.make} ${v.model} ${v.year}` }))} value={vehicle?.id} />
        </div>
      </Suspense>

      {limited ? <Empty>{t.errors.rate_limited}</Empty> : null}
      {failed ? <Empty>{t.errors.generic}</Empty> : null}
      {query && !limited && !failed ? (
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="label-mono mb-3">{t.search.codeSection}</h2>
            {code ? <DtcView r={code} t={t} locale={locale} vehicleId={vehicle?.id} /> : <Empty>{t.search.none}</Empty>}
          </div>
          <div>
            <h2 className="label-mono mb-3">{t.search.textSection}</h2>
            {text.length ? (
              <ul className="ticket divide-y divide-dashed divide-rule">
                {text.map((h) => (
                  <li key={`${h.kind}-${h.id}`} className="p-4">
                    {h.kind === "guide" ? (
                      <Link href={`/guides/${h.slug}`} className="group block">
                        <p className="label-mono mb-1">{t.search.guideHit} · {(t.kb.category as Record<string, string>)[h.category ?? ""] ?? h.category}</p>
                        <p className="font-medium group-hover:text-signal">{locale === "ar" ? h.titleAr : h.titleEn}</p>
                        {h.relatedCodes?.length ? <p className="mt-1 flex flex-wrap gap-1">{h.relatedCodes.slice(0, 5).map((c) => <span key={c} className="code-tag text-xs">{c}</span>)}</p> : null}
                      </Link>
                    ) : h.kind === "dtc" ? (
                      <Link href={`/codes/${h.code}${vehicle ? `?vehicleId=${vehicle.id}` : ""}`} className="group block">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="code-tag text-xs">{h.code}</span>
                          {h.reviewStatus !== "reviewed" ? <Stamp tone="warn">{t.common.draft}</Stamp> : null}
                        </div>
                        <p className="font-medium group-hover:text-signal">{locale === "ar" ? h.titleAr : h.titleEn}</p>
                      </Link>
                    ) : (
                      <div>
                        <p className="label-mono">{t.search.localTerm}</p>
                        <p>
                          <strong>«{h.matchedTerm}»</strong> {t.search.means} {locale === "ar" ? h.titleAr : h.titleEn} <Ltr className="text-xs text-ink-3">{h.titleEn}</Ltr>
                        </p>
                        <Link className="link text-sm" href={`/market?q=${encodeURIComponent(h.titleEn)}`}>{t.dtc.findParts}</Link>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{t.search.none}</Empty>
            )}
          </div>
        </div>
      ) : null}
    </Container>
  );
}
