import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RecallsPanel } from "./recalls-panel";
import { Container, Ltr, PageHeader, Stamp } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";
import { listRecords, listReminders } from "@/server/modules/maintenance/service";
import { getOwnedVehicle, toVehicleDto } from "@/server/modules/vehicles/service";
import { VehicleActions } from "./vehicle-actions";
import { MaintenancePanel } from "./maintenance-panel";

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth(`/garage/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const row = await getOwnedVehicle(auth.user.id, id).catch(() => null);
  if (!row) notFound();
  const v = toVehicleDto(row);
  const { t, locale } = await getDict();
  const [records, reminders] = await Promise.all([listRecords(auth.user.id, id), listReminders(auth.user.id, id)]);

  return (
    <Container>
      <PageHeader
        kicker={v.nickname ?? t.garage.title}
        title={`${v.make} ${v.model} ${v.year}`}
        actions={
          <>
            <Link href={`/diagnose/new?vehicleId=${v.id}`} className="btn btn-primary">{t.diagnose.newSession}</Link>
            <Link href={`/market?vehicleId=${v.id}`} className="btn">{t.dtc.findParts}</Link>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="ticket">
          <div className="ticket-head"><span>{t.garage.title}</span><span dir="ltr">VEH-{v.id.slice(0, 6).toUpperCase()}</span></div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 p-5 text-sm">
            <dt className="text-ink-3">{t.garage.engine}</dt><dd>{v.engine ? <Ltr>{v.engine}</Ltr> : "—"}</dd>
            <dt className="text-ink-3">{t.garage.fuel}</dt><dd>{t.garage.fuels[v.fuel as keyof typeof t.garage.fuels] ?? v.fuel}</dd>
            <dt className="text-ink-3">{t.garage.transmission}</dt><dd>{t.garage.transmissions[v.transmission as keyof typeof t.garage.transmissions] ?? v.transmission}</dd>
            <dt className="text-ink-3">{t.garage.market}</dt><dd>{t.garage.markets[v.salesMarket as keyof typeof t.garage.markets] ?? v.salesMarket}</dd>
            <dt className="text-ink-3">{t.garage.odometer}</dt><dd>{v.odometer != null ? <Ltr>{v.odometer.toLocaleString("en")} {v.odometerUnit}</Ltr> : "—"}</dd>
            <dt className="text-ink-3">VIN</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {v.vinMasked ? <Ltr>{v.vinMasked}</Ltr> : "—"}
              {v.vinMasked ? v.vinDataConfirmed ? <Stamp tone="ok">{t.common.yes}</Stamp> : <Stamp tone="neutral">{t.common.unknown}</Stamp> : null}
            </dd>
          </dl>
          {v.vinDecode ? (
            <details className="border-t border-dashed border-rule px-5 py-3 text-xs">
              <summary className="cursor-pointer text-ink-2">{t.garage.vinSuggestion}</summary>
              <dl className="mt-2 grid grid-cols-2 gap-1" dir="ltr">
                {Object.entries(v.vinDecode).filter(([k]) => k !== "warnings").map(([k, val]) => (
                  <div key={k} className="contents"><dt className="text-ink-3">{k}</dt><dd>{String(val)}</dd></div>
                ))}
              </dl>
              <p className="mt-2 text-ink-3">{t.garage.vinNotProof}</p>
            </details>
          ) : null}
          <div className="border-t border-dashed border-rule p-4">
            <VehicleActions vehicleId={v.id} hasVin={Boolean(v.vinMasked)} mfaEnabled={auth.user.mfaEnabled} />
          </div>
        </section>
        <MaintenancePanel
          vehicleId={v.id}
          odometerUnit={v.odometerUnit}
          records={records.map((r) => ({ id: r.id, kind: r.kind, performedAt: r.performedAt, odometer: r.odometer, notes: r.notes, costMinor: r.costMinor, currency: r.currency }))}
          reminders={reminders.map((r) => ({ id: r.id, title: r.title, dueDate: r.dueDate, dueOdometer: r.dueOdometer, origin: r.origin, status: r.status }))}
        />
        <Suspense fallback={null}>
          <RecallsPanel userId={auth.user.id} vehicleId={v.id} t={t} locale={locale} />
        </Suspense>
      </div>
    </Container>
  );
}
