"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormError, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { Stamp } from "@/components/ui/bits";
import { api } from "@/lib/api-client";

/** Learning consent: opt-in, separate from Terms, versioned, withdrawable. */
export function ConsentCard({ consent, textVersion }: { consent: { grantedAt: string; textVersion: string } | null; textVersion: string }) {
  const { t, locale } = useT();
  const router = useRouter();
  const { pending, error, run } = useSubmit<unknown>();
  return (
    <aside className="ticket self-start">
      <div className="ticket-head"><span>{t.consent.title}</span><span dir="ltr">{textVersion}</span></div>
      <div className="space-y-3 p-5 text-sm">
        <p>{t.consent.body}</p>
        <p className="text-ink-3">{t.consent.withdrawNote}</p>
        <Link className="link" href="/legal/learning-consent">{t.footer.privacy}</Link>
        <FormError error={error} />
        {consent ? (
          <div className="space-y-2">
            <Stamp tone="ok">{t.consent.active} {new Date(consent.grantedAt).toLocaleDateString(locale === "ar" ? "ar-IQ" : "en-GB")}</Stamp>
            <div><button type="button" className="btn btn-sm" disabled={pending} onClick={async () => { if (await run(() => api("/consent", { method: "PUT", body: { purpose: "learning", granted: false, textVersion } }))) router.refresh(); }}>{t.consent.withdraw}</button></div>
          </div>
        ) : (
          <div className="space-y-2">
            <Stamp tone="neutral">{t.consent.inactive}</Stamp>
            <div><button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={async () => { if (await run(() => api("/consent", { method: "PUT", body: { purpose: "learning", granted: true, textVersion, sources: ["repair_cases"] } }))) router.refresh(); }}>{t.consent.grant}</button></div>
          </div>
        )}
      </div>
    </aside>
  );
}
