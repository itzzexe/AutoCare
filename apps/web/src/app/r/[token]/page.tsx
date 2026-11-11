import { notFound } from "next/navigation";
import { Container, Notice, Stamp, fmtDate } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { currentAuth } from "@/server/http/session";
import { AppError } from "@/server/lib/errors";
import type { RulesResult } from "@/server/modules/diagnostics/rules";
import { openShare } from "@/server/modules/diagnostics/service";

export const metadata = { title: "تقرير مشترك", referrer: "no-referrer" as const };

/** Read-only shared report: no VIN, no owner identity, expires and can be revoked. */
export default async function SharedReport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t, locale } = await getDict();
  const auth = await currentAuth();
  let data: Awaited<ReturnType<typeof openShare>>;
  try {
    data = await openShare(token, auth?.user.id ?? null);
  } catch (e) {
    if (e instanceof AppError && e.code === "unauthenticated") {
      return (
        <Container narrow>
          <Notice tone="warn">{t.common.signInToUse}</Notice>
        </Container>
      );
    }
    notFound();
  }
  const rules = data.latest?.rulesResult as unknown as RulesResult | undefined;
  const model = data.latest?.modelResult as null | { summary: string; likelyCauses: Array<{ cause: string }> };
  return (
    <Container narrow>
      <article className="ticket overflow-hidden">
        {rules && (rules.urgency === "stop_driving" || rules.urgency === "urgent") ? <div className="hazard red" /> : null}
        <div className="ticket-head"><span>{t.diagnose.share}</span><span>{fmtDate(data.expiresAt, locale, true)}</span></div>
        <div className="space-y-5 p-6">
          {data.vehicle ? <h1 className="text-2xl font-bold">{String(data.vehicle.make)} {String(data.vehicle.model)} {String(data.vehicle.year)}</h1> : null}
          <div className="flex flex-wrap gap-1.5">{data.codes.map((c) => <span key={c.code} className="code-tag">{c.code}</span>)}</div>
          {data.symptoms ? <p className="text-ink-2">“{data.symptoms}”</p> : null}
          {rules ? (
            <>
              <Stamp tone={rules.urgency === "stop_driving" || rules.urgency === "urgent" ? "danger" : rules.urgency === "soon" ? "warn" : "neutral"} className="text-base">{t.diagnose.urgency[rules.urgency]}</Stamp>
              {rules.hits.length ? <ul className="space-y-1 text-sm">{rules.hits.map((h) => <li key={h.id}>• {locale === "ar" ? h.ar : h.en}</li>)}</ul> : null}
              {model ? (
                <section>
                  <h2 className="label-mono mb-1">{t.diagnose.explanation}</h2>
                  <p>{model.summary}</p>
                  <ul className="mt-2 list-inside list-disc text-sm">{model.likelyCauses.map((c, i) => <li key={i}>{c.cause}</li>)}</ul>
                </section>
              ) : null}
              <section>
                <h2 className="label-mono mb-1">{t.diagnose.stepChecks}</h2>
                <ol className="list-inside list-decimal space-y-1 text-sm">
                  {rules.orderedChecks.map((c) => <li key={c.id}>{locale === "ar" ? c.ar : c.en} — <span className="text-ink-3">{c.status}</span></li>)}
                </ol>
              </section>
            </>
          ) : null}
          <p className="border-t border-dashed border-rule pt-3 text-xs text-ink-3">{t.footer.note}</p>
        </div>
      </article>
    </Container>
  );
}
