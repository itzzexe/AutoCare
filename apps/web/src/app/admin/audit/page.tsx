import { PageHeader } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requirePermission } from "@/server/http/session";
import { AuditPanel } from "../panels";

export default async function Page() {
  await requirePermission("admin:audit", "/admin/audit");
  const { locale } = await getDict();
  return (
    <div>
      <PageHeader title={locale === "ar" ? "سجل التدقيق" : "Audit log"} />
      <AuditPanel />
    </div>
  );
}
