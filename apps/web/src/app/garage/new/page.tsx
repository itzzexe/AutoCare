import { Container, PageHeader } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";
import { VehicleForm } from "../vehicle-form";

export const metadata = { title: "أضف سيارة" };

export default async function NewVehicle() {
  await requireAuth("/garage/new");
  const { t } = await getDict();
  return (
    <Container narrow>
      <PageHeader title={t.garage.add} />
      <VehicleForm />
    </Container>
  );
}
