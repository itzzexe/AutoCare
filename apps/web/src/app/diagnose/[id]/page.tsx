import { notFound } from "next/navigation";
import { Container } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";
import { getSessionDetail, previewRules } from "@/server/modules/diagnostics/service";
import { getOwnedVehicle } from "@/server/modules/vehicles/service";
import { Wizard } from "./wizard";

export const metadata = { title: "جلسة تشخيص" };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const auth = await requireAuth(`/diagnose/${id}`);
  const detail = await getSessionDetail(auth.user.id, id).catch(() => null);
  if (!detail) notFound();
  const [rules, vehicle] = await Promise.all([previewRules(auth.user.id, id), getOwnedVehicle(auth.user.id, detail.session.vehicleId)]);
  const { locale } = await getDict();
  return (
    <Container>
      <Wizard
        locale={locale}
        session={{ id: detail.session.id, step: detail.session.step, codes: detail.session.codes, symptoms: detail.session.symptoms, context: detail.session.context }}
        vehicle={{ id: vehicle.id, label: `${vehicle.make} ${vehicle.model} ${vehicle.year}` }}
        preview={rules}
        latest={detail.latest ? { rules: detail.latest.rulesResult, model: detail.latest.modelResult, modelStatus: detail.latest.modelStatus, rulesVersion: detail.latest.rulesVersion, modelName: detail.latest.modelName, promptVersion: detail.latest.promptVersion, createdAt: detail.latest.createdAt.toISOString() } : null}
      />
    </Container>
  );
}
