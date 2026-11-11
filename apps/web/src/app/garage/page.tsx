import Link from "next/link";
import { Container, Empty, Ltr, PageHeader } from "@/components/ui/bits";
import { Icon } from "@/components/ui/icon";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";
import { listVehicles } from "@/server/modules/vehicles/service";

export const metadata = { title: "كراجي" };

export default async function GaragePage() {
  const auth = await requireAuth("/garage");
  const { t } = await getDict();
  const vehicles = await listVehicles(auth.user.id);
  return (
    <Container>
      <PageHeader title={t.garage.title} actions={<Link href="/garage/new" className="btn btn-primary"><Icon name="plus" size={18} />{t.garage.add}</Link>} />
      {vehicles.length === 0 ? (
        <Empty action={<Link href="/garage/new" className="btn btn-primary">{t.garage.add}</Link>}>{t.garage.empty}</Empty>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v, i) => (
            <li key={v.id} className={`rise rise-${Math.min(i + 1, 4)}`}>
              <Link href={`/garage/${v.id}`} className="ticket group block h-full transition-transform hover:-translate-y-0.5">
                <div className="ticket-head">
                  <span>{v.nickname ?? t.garage.title}</span>
                  <span dir="ltr">{v.year}</span>
                </div>
                <div className="p-5">
                  <p className="font-display text-2xl font-bold group-hover:text-signal">{v.make} <span className="font-medium text-ink-2">{v.model}</span></p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <dt className="text-ink-3">{t.garage.engine}</dt><dd>{v.engine ? <Ltr>{v.engine}</Ltr> : "—"}</dd>
                    <dt className="text-ink-3">{t.garage.fuel}</dt><dd>{t.garage.fuels[v.fuel as keyof typeof t.garage.fuels] ?? v.fuel}</dd>
                    <dt className="text-ink-3">{t.garage.odometer}</dt><dd>{v.odometer != null ? <Ltr>{v.odometer.toLocaleString("en")} {v.odometerUnit}</Ltr> : "—"}</dd>
                    <dt className="text-ink-3">VIN</dt><dd>{v.vinMasked ? <Ltr>{v.vinMasked}</Ltr> : "—"}</dd>
                  </dl>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
