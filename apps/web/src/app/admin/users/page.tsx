import { PageHeader } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requirePermission } from "@/server/http/session";
import { UsersPanel } from "../panels";

export default async function Page() {
  const auth = await requirePermission("admin:users", "/admin/users");
  const { locale } = await getDict();
  return (
    <div>
      <PageHeader title={locale === "ar" ? "المستخدمون والأدوار" : "Users & roles"} />
      <UsersPanel mfaEnabled={auth.user.mfaEnabled} />
    </div>
  );
}
