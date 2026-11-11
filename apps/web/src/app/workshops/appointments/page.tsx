import { Container, Empty, PageHeader, Stamp, fmtDate } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";
import { myAppointments } from "@/server/modules/workshops/service";
import { OwnerApptActions } from "./owner-actions";

export const metadata = { title: "مواعيدي" };

export default async function AppointmentsPage() {
  const auth = await requireAuth("/workshops/appointments");
  const { t, locale } = await getDict();
  const rows = await myAppointments(auth.user.id);
  return (
    <Container>
      <PageHeader title={t.workshops.appointments} />
      {rows.length === 0 ? <Empty>{t.common.empty}</Empty> : null}
      <ul className="space-y-3">
        {rows.map(({ a, workshopName, workshopCity }) => (
          <li key={a.id} className="ticket grid gap-3 p-5 sm:grid-cols-[1fr_auto]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-bold">{workshopName}</p>
                <Stamp tone={a.status === "confirmed" || a.status === "completed" ? "ok" : a.status === "rescheduled" ? "warn" : a.status === "requested" ? "info" : "neutral"}>{t.workshops.apptStatus[a.status]}</Stamp>
              </div>
              <p className="text-sm text-ink-2">{workshopCity} · {String(a.vehicleSnapshot.make)} {String(a.vehicleSnapshot.model)}</p>
              <p className="text-sm">{fmtDate(a.preferredAt, locale, true)}{a.proposedAt && a.status === "rescheduled" ? ` → ${fmtDate(a.proposedAt, locale, true)}` : ""}</p>
              {a.reportShareId ? <p className="text-xs text-ink-3">{t.workshops.shareReport} ✓</p> : null}
            </div>
            <OwnerApptActions id={a.id} status={a.status} />
          </li>
        ))}
      </ul>
    </Container>
  );
}
