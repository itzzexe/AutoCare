import { getDict } from "@/i18n/server";
import { isProd } from "@/server/config/env";
import { Notice } from "@/components/ui/bits";
import { AuthCard } from "../auth-card";

export default async function CheckEmail() {
  const { t } = await getDict();
  return (
    <AuthCard title={t.auth.checkEmail} refCode="AUTH-03">
      <p className="mb-4 text-ink-2">{t.auth.checkEmailBody}</p>
      {!isProd() ? <Notice tone="warn">{t.auth.devOutbox}</Notice> : null}
    </AuthCard>
  );
}
