import { PageHeader } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";
import { isPrivileged } from "@/server/modules/identity/rbac";
import { SecurityPanel } from "./security-panel";

export default async function SecurityPage() {
  const auth = await requireAuth("/account/security");
  const { t } = await getDict();
  return (
    <>
      <PageHeader title={t.account.security} />
      <SecurityPanel mfaEnabled={auth.user.mfaEnabled} privileged={isPrivileged(auth.user.roles)} />
    </>
  );
}
