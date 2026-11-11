import Link from "next/link";
import { Container, Empty, PageHeader } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";
import { listVehicles } from "@/server/modules/vehicles/service";
import { StartForm } from "./start-form";

export const metadata = { title: "تشخيص جديد" };

export default async function NewDiagnosis({ searchParams }: { searchParams: Promise<{ codes?: string; vehicleId?: string; symptoms?: string }> }) {
  const sp = await searchParams;
  const auth = await requireAuth(`/diagnose/new${sp.codes || sp.symptoms ? `?${new URLSearchParams({ ...(sp.codes ? { codes: sp.codes.slice(0, 200) } : {}), ...(sp.symptoms ? { symptoms: sp.symptoms.slice(0, 300) } : {}) })}` : ""}`);
  const { t } = await getDict();
  const vehicles = await listVehicles(auth.user.id);
  return (
    <Container narrow>
      <PageHeader kicker={`${t.diagnose.stepVehicle} · ${t.diagnose.stepCodes}`} title={t.diagnose.newSession} />
      {vehicles.length === 0 ? (
        <Empty action={<Link className="btn btn-primary" href="/garage/new">{t.garage.add}</Link>}>{t.diagnose.needVehicle}</Empty>
      ) : (
        <StartForm vehicles={vehicles.map((v) => ({ id: v.id, label: `${v.make} ${v.model} ${v.year}` }))} initialCodes={(sp.codes ?? "").slice(0, 200)} initialVehicle={sp.vehicleId} initialSymptoms={(sp.symptoms ?? "").slice(0, 300)} />
      )}
    </Container>
  );
}
