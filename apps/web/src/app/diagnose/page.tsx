import Link from "next/link";
import { Container, Empty, PageHeader, Stamp, fmtDate } from "@/components/ui/bits";
import { Icon } from "@/components/ui/icon";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";
import { listSessions } from "@/server/modules/diagnostics/service";
import { listVehicles } from "@/server/modules/vehicles/service";

export const metadata = { title: "التشخيص" };

export default async function DiagnoseIndex() {
  const auth = await requireAuth("/diagnose");
  const { t, locale } = await getDict();
  const [sessions, vehicles] = await Promise.all([listSessions(auth.user.id), listVehicles(auth.user.id)]);
  const vmap = new Map(vehicles.map((v) => [v.id, `${v.make} ${v.model} ${v.year}`]));
  return (
    <Container>
      <PageHeader title={t.diagnose.title} actions={<Link href="/diagnose/new" className="btn btn-primary"><Icon name="plus" size={18} />{t.diagnose.newSession}</Link>} />
      <h2 className="label-mono mb-3">{t.diagnose.history}</h2>
      {sessions.length === 0 ? (
        <Empty action={<Link className="btn btn-primary" href="/diagnose/new">{t.diagnose.newSession}</Link>}>{t.common.empty}</Empty>
      ) : (
        <ul className="ticket divide-y divide-dashed divide-rule">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link href={`/diagnose/${s.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-paper-2">
                <div>
                  <p className="font-semibold">{vmap.get(s.vehicleId) ?? "—"}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {s.codes.slice(0, 5).map((c) => <span key={c.code} className="code-tag text-[0.7rem]">{c.code}</span>)}
                    {!s.codes.length ? <span className="text-sm text-ink-3">{s.symptoms.slice(0, 80)}</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-ink-3">
                  <Stamp tone={s.status === "completed" ? "ok" : "info"}>{s.status === "completed" ? t.diagnose.stepResult : t.diagnose.resume}</Stamp>
                  {fmtDate(s.updatedAt, locale)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
