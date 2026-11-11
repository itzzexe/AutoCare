import { Container, PageHeader } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";
import { listVehicles } from "@/server/modules/vehicles/service";
import { CaseForm } from "./case-form";

export const metadata = { title: "سجّل حالة" };

export default async function NewCase({ searchParams }: { searchParams: Promise<{ sessionId?: string; vehicleId?: string }> }) {
  const sp = await searchParams;
  const auth = await requireAuth("/cases/new");
  const { t } = await getDict();
  const vehicles = await listVehicles(auth.user.id);
  return (
    <Container narrow>
      <PageHeader title={t.cases.new} lead={t.cases.lead} />
      <CaseForm vehicles={vehicles.map((v) => ({ id: v.id, label: `${v.make} ${v.model} ${v.year}` }))} sessionId={sp.sessionId && /^[0-9a-f-]{36}$/.test(sp.sessionId) ? sp.sessionId : undefined} vehicleId={sp.vehicleId} />
    </Container>
  );
}
