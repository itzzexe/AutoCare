import Link from "next/link";
import { Container, Empty, PageHeader, Stamp, fmtDate } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";
import { activeConsent, CONSENT_TEXT_VERSION, listMyCases } from "@/server/modules/learning/service";
import { ConsentCard } from "./consent-card";

export const metadata = { title: "حالاتي" };

const tone = { submitted: "info", needs_review: "warn", verified: "ok", rejected: "danger", inconclusive: "neutral" } as const;

export default async function CasesPage() {
  const auth = await requireAuth("/cases");
  const { t, locale } = await getDict();
  const [cases, consent] = await Promise.all([listMyCases(auth.user.id), activeConsent(auth.user.id)]);
  return (
    <Container>
      <PageHeader title={t.cases.title} lead={t.cases.lead} actions={<Link href="/cases/new" className="btn btn-primary">{t.cases.new}</Link>} />
      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div>
          {cases.length === 0 ? (
            <Empty>{t.common.empty}</Empty>
          ) : (
            <ul className="space-y-3">
              {cases.map((c) => (
                <li key={c.id} className="ticket p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {c.codes.map((code) => <span key={code} className="code-tag text-xs">{code}</span>)}
                      <span className="font-semibold">{String(c.vehicleSnapshot.make ?? "")} {String(c.vehicleSnapshot.model ?? "")}</span>
                    </div>
                    <Stamp tone={tone[c.status]}>{t.cases.status[c.status]}</Stamp>
                  </div>
                  {c.confirmedCause ? <p className="mt-2"><span className="text-ink-3">{t.cases.confirmedCause}: </span>{c.confirmedCause}</p> : null}
                  <p className="mt-1 text-sm text-ink-3">{t.cases.outcome}: {t.cases.outcomes[c.outcome]} · {fmtDate(c.createdAt, locale)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <ConsentCard consent={consent ? { grantedAt: consent.grantedAt.toISOString(), textVersion: consent.textVersion } : null} textVersion={CONSENT_TEXT_VERSION} />
      </div>
    </Container>
  );
}
