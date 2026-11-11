import Link from "next/link";
import { notFound } from "next/navigation";
import { urgencyTone } from "@/components/kb/guide-card";
import { CodeTag, Container, Ltr, Notice, Stamp } from "@/components/ui/bits";
import { Icon } from "@/components/ui/icon";
import { getDict } from "@/i18n/server";
import { canonical, publicRobots } from "@/server/http/seo";
import { getGuide } from "@/server/modules/knowledge/library-service";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { locale } = await getDict();
  const g = await getGuide(slug);
  if (!g) return { title: "404" };
  return {
    title: locale === "ar" ? g.titleAr : g.titleEn,
    description: locale === "ar" ? g.summaryAr : g.summaryEn,
    robots: publicRobots(),
    alternates: { canonical: canonical(`/guides/${g.slug}`) },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t, locale } = await getDict();
  const g = await getGuide(slug);
  if (!g) notFound();
  const L = (x: { ar: string; en: string }) => (locale === "ar" ? x.ar : x.en);
  const cat = (t.kb.category as Record<string, string>)[g.category] ?? g.category;
  const diagnoseHref = `/diagnose/new?${new URLSearchParams({ symptoms: locale === "ar" ? g.titleAr : g.titleEn })}`;

  return (
    <Container>
      <nav className="mb-4 text-sm text-ink-3">
        <Link className="link" href="/guides">{t.kb.guidesTitle}</Link> / <Link className="link" href={`/guides?c=${g.category}`}>{cat}</Link>
      </nav>
      <article className="ticket max-w-4xl overflow-hidden">
        {g.urgency === "stop_driving" || g.safetyArea !== "none" ? <div className="hazard red" /> : null}
        <div className="ticket-head">
          <span>{cat}</span>
          <span dir="ltr">{g.version}</span>
        </div>
        <div className="space-y-6 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Stamp tone={urgencyTone[g.urgency]}>{t.kb.urgency[g.urgency]}</Stamp>
            {g.reviewStatus === "reviewed" ? <Stamp tone="ok">{t.dtc.reviewedStamp}</Stamp> : <Stamp tone="warn">{t.dtc.unreviewed}</Stamp>}
            {g.safetyArea !== "none" ? <Stamp tone="danger">{t.dtc.safety}</Stamp> : null}
          </div>
          <div>
            <h1 className="text-3xl font-bold">{locale === "ar" ? g.titleAr : g.titleEn}</h1>
            {locale === "ar" ? <p className="mt-0.5 text-sm text-ink-3" dir="ltr">{g.titleEn}</p> : null}
            <p className="mt-3 text-[1.05rem]">{locale === "ar" ? g.summaryAr : g.summaryEn}</p>
          </div>

          {g.urgency === "stop_driving" ? <Notice tone="danger">{t.kb.stopDriving}</Notice> : null}
          {g.safetyArea !== "none" ? <Notice tone="danger">{t.dtc.safetyNote}</Notice> : null}

          <div className="grid gap-5 md:grid-cols-2">
            <section>
              <h2 className="label-mono mb-2">{t.kb.symptoms}</h2>
              <ul className="space-y-1.5">
                {g.symptoms.map((s, i) => <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 bg-ink" />{L(s)}</li>)}
              </ul>
            </section>
            <section>
              <h2 className="label-mono mb-2">{t.kb.causes}</h2>
              <ol className="space-y-1.5">
                {g.causes.map((c, i) => (
                  <li key={i} className="flex gap-2"><span className="font-mono text-xs leading-7 text-ink-3" dir="ltr">{String(i + 1).padStart(2, "0")}</span>{L(c)}</li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-ink-3">{t.dtc.causesNote}</p>
            </section>
          </div>

          <section>
            <h2 className="label-mono mb-2">{t.kb.checks}</h2>
            <ol className="divide-y divide-dashed divide-rule border-y border-rule">
              {g.checks.map((c, i) => (
                <li key={c.id} className="grid gap-1 py-3 sm:grid-cols-[2.5rem_1fr_auto]">
                  <span className="text-xl font-bold text-signal" dir="ltr">{i + 1}</span>
                  <div>
                    <p className="font-medium">{locale === "ar" ? c.ar : c.en}</p>
                    <p className="text-sm text-ink-2"><span className="text-ink-3">{t.dtc.expected}: </span>{locale === "ar" ? c.expectedAr : c.expectedEn}</p>
                    {c.tools.length ? <p className="text-xs text-ink-3">{t.dtc.tools}: {c.tools.join("، ")}</p> : null}
                  </div>
                  <Stamp tone={c.where === "home" ? "ok" : c.where === "workshop" ? "info" : "danger"} className="self-start">{t.dtc.where[c.where]}</Stamp>
                </li>
              ))}
            </ol>
          </section>

          {g.fixes.length ? (
            <section className="border border-rule bg-paper-2 p-4">
              <h2 className="label-mono mb-2">{t.kb.fixes}</h2>
              <ul className="space-y-1.5">
                {g.fixes.map((f, i) => <li key={i} className="flex gap-2"><Icon name="wrench" size={16} className="mt-1 shrink-0 text-ink-3" />{L(f)}</li>)}
              </ul>
              <p className="mt-3 text-xs text-ink-3">{t.dtc.fixesNote}</p>
            </section>
          ) : null}

          {g.relatedCodes.length ? (
            <section>
              <h2 className="label-mono mb-2">{t.kb.relatedCodes}</h2>
              <ul className="flex flex-wrap gap-2">
                {g.relatedCodes.map((c) => (
                  <li key={c.code}>
                    <Link href={`/codes/${c.code}`} className="group inline-flex items-center gap-2 border border-rule px-2 py-1 hover:border-ink">
                      <CodeTag code={c.code} />
                      {c.titleAr ? <span className="max-w-[16rem] truncate text-sm text-ink-2 group-hover:text-ink">{locale === "ar" ? c.titleAr : c.titleEn}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-dashed border-rule pt-4">
            <Link href={diagnoseHref} className="btn btn-primary btn-sm">{t.kb.diagnoseThis}</Link>
            <Link href="/workshops" className="btn btn-sm">{t.kb.findWorkshop}</Link>
          </div>
          <p className="text-xs text-ink-3">{t.kb.editorial} · {g.sourceTitle} · <Ltr>{g.version}</Ltr></p>
        </div>
      </article>
    </Container>
  );
}
