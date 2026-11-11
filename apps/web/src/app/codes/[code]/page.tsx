import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DtcView } from "@/components/dtc-view";
import { Container } from "@/components/ui/bits";
import { VehiclePicker } from "@/components/vehicle-picker";
import { getDict } from "@/i18n/server";
import { currentAuth } from "@/server/http/session";
import Link from "next/link";
import { GuideCard } from "@/components/kb/guide-card";
import { canonical, publicRobots } from "@/server/http/seo";
import { lookupDtc } from "@/server/modules/knowledge/dtc-service";
import { guidesForCode } from "@/server/modules/knowledge/library-service";
import { getOwnedVehicle, listVehicles } from "@/server/modules/vehicles/service";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { locale } = await getDict();
  const r = await lookupDtc(decodeURIComponent(code).slice(0, 16));
  const def = r?.definitions[0];
  if (!r || !def) return { title: decodeURIComponent(code).toUpperCase().slice(0, 16) };
  // Only generic, sourced definitions are indexable; manufacturer codes without a source never are.
  return {
    title: `${r.parsed.code} — ${locale === "ar" ? def.titleAr : def.titleEn}`,
    description: (locale === "ar" ? def.meaningAr : def.meaningEn).slice(0, 160),
    robots: r.parsed.scope === "generic" ? publicRobots() : { index: false, follow: false },
    alternates: { canonical: canonical(`/codes/${r.parsed.code}`) },
  };
}

export default async function CodePage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ vehicleId?: string }> }) {
  const { code } = await params;
  const { vehicleId } = await searchParams;
  const { t, locale } = await getDict();
  const auth = await currentAuth();
  const vehicles = auth ? await listVehicles(auth.user.id) : [];
  const vehicle = auth && vehicleId && /^[0-9a-f-]{36}$/.test(vehicleId) ? await getOwnedVehicle(auth.user.id, vehicleId).catch(() => null) : null;
  const r = await lookupDtc(decodeURIComponent(code).slice(0, 16), vehicle ? { make: vehicle.make, model: vehicle.model, year: vehicle.year, engine: vehicle.engine, market: vehicle.salesMarket } : undefined);
  if (!r) notFound();
  const guides = await guidesForCode(r.parsed.code);
  return (
    <Container>
      <Suspense>
        <div className="mb-6">
          <VehiclePicker vehicles={vehicles.map((v) => ({ id: v.id, label: `${v.make} ${v.model} ${v.year}` }))} value={vehicle?.id} />
        </div>
      </Suspense>
      <div className="max-w-4xl">
        <DtcView r={r} t={t} locale={locale} full vehicleId={vehicle?.id} />
      </div>
      {guides.length ? (
        <section className="mt-8 max-w-4xl">
          <h2 className="label-mono mb-3">{t.dtc.relatedGuides}</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {guides.map((g) => <li key={g.slug}><GuideCard g={g} t={t} locale={locale} /></li>)}
          </ul>
        </section>
      ) : null}
      <p className="mt-6 text-sm"><Link className="link" href="/codes">{t.kb.libraryTitle}</Link></p>
    </Container>
  );
}
