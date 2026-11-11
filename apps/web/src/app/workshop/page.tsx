import { Container, Notice, PageHeader, Stamp } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";
import { workshopAppointments, workshopOf } from "@/server/modules/workshops/service";
import { ApplyWorkshop, WorkshopConsole } from "./console";

export const metadata = { title: "لوحة الورشة" };

export default async function WorkshopConsolePage() {
  const auth = await requireAuth("/workshop");
  const { t, locale } = await getDict();
  const r = await workshopOf(auth.user.id);
  const isAr = locale === "ar";
  if (!r) {
    return (
      <Container narrow>
        <PageHeader title={t.nav.workshopConsole} lead={isAr ? "سجّل ورشتك لتظهر في الدليل وتستقبل المواعيد. التفعيل بعد مراجعة المشرف." : "Register your workshop to appear in the directory. Activated after moderator review."} />
        <ApplyWorkshop />
      </Container>
    );
  }
  if (r.w.status !== "approved" || !auth.user.roles.includes("workshop")) {
    return (
      <Container narrow>
        <PageHeader title={r.w.name} />
        <Notice tone="warn"><Stamp tone="warn">{r.w.status}</Stamp> {r.w.status === "approved" ? (isAr ? "تمت الموافقة. سجّل الدخول من جديد." : "Approved. Sign in again.") : isAr ? "بانتظار مراجعة المشرف." : "Awaiting moderator review."}</Notice>
      </Container>
    );
  }
  const appts = await workshopAppointments(auth.user.id);
  return (
    <Container>
      <PageHeader kicker={t.nav.workshopConsole} title={r.w.name} />
      <WorkshopConsole
        appointments={appts.map((a) => ({ id: a.id, status: a.status, preferredAt: a.preferredAt.toISOString(), proposedAt: a.proposedAt?.toISOString() ?? null, note: a.note, vehicle: a.vehicleSnapshot, hasSharedReport: a.hasSharedReport, workOrders: a.workOrders.map((w) => ({ id: w.id, status: w.status, quoteMinor: w.quoteMinor, resultNotes: w.resultNotes, checks: w.checks })) }))}
      />
    </Container>
  );
}
