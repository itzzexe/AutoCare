import Link from "next/link";
import { PageHeader } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";
import { activeConsent, CONSENT_TEXT_VERSION } from "@/server/modules/learning/service";
import { ConsentCard } from "@/app/cases/consent-card";
import { PrivacyActions } from "./privacy-actions";

export default async function PrivacyPage() {
  const auth = await requireAuth("/account/privacy");
  const { t } = await getDict();
  const consent = await activeConsent(auth.user.id);
  return (
    <>
      <PageHeader title={t.account.privacy} />
      <div className="grid gap-6 lg:grid-cols-2">
        <ConsentCard consent={consent ? { grantedAt: consent.grantedAt.toISOString(), textVersion: consent.textVersion } : null} textVersion={CONSENT_TEXT_VERSION} />
        <PrivacyActions mfaEnabled={auth.user.mfaEnabled} />
      </div>
      <p className="text-sm"><Link className="link" href="/legal/privacy">{t.footer.privacy}</Link></p>
    </>
  );
}
