import { PageHeader } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requirePermission } from "@/server/http/session";
import { OutboxPanel } from "../panels";

export default async function Page() {
  await requirePermission("admin:dev_outbox", "/admin/outbox");
  const { locale } = await getDict();
  return (
    <div>
      <PageHeader title={locale === "ar" ? "صندوق التطوير (بيئة التطوير فقط)" : "Dev outbox"} />
      <OutboxPanel />
    </div>
  );
}
