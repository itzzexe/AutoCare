import { PageHeader } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requirePermission } from "@/server/http/session";
import { ModerationPanel } from "../panels";

export default async function Page() {
  await requirePermission("moderation:merchants", "/admin/moderation");
  const { locale } = await getDict();
  return (
    <div>
      <PageHeader title={locale === "ar" ? "الإشراف" : "Moderation"} />
      <ModerationPanel />
    </div>
  );
}
