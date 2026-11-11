import { PageHeader } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requirePermission } from "@/server/http/session";
import { LearningPanel } from "../panels";

export default async function Page() {
  const auth = await requirePermission("admin:learning", "/admin/learning");
  const { locale } = await getDict();
  return (
    <div>
      <PageHeader title={locale === "ar" ? "البيانات والنماذج" : "Datasets & models"} />
      <LearningPanel mfaEnabled={auth.user.mfaEnabled} />
    </div>
  );
}
