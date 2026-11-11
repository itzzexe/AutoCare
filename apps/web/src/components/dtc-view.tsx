import Link from "next/link";
import type { Dict } from "@/i18n/ar";
import type { DtcLookupResult } from "@/server/modules/knowledge/dtc-service";
import { CodeTag, Ltr, Notice, Stamp, fmtDate } from "./ui/bits";
import { Icon } from "./ui/icon";

const statusTone = { covered: "ok", make_only: "warn", needs_vehicle: "info", not_covered: "danger" } as const;

export function DtcView({ r, t, locale, full = false, vehicleId }: { r: DtcLookupResult; t: Dict; locale: "ar" | "en"; full?: boolean; vehicleId?: string }) {
  const L = (x: { ar: string; en: string }) => (locale === "ar" ? x.ar : x.en);
  const def = r.definitions[0];
  const isMfr = r.parsed.scope !== "generic";
  return (
    <article className="ticket overflow-hidden">
      {def && def.safetyArea !== "none" ? <div className="hazard red" /> : null}
      <div className="ticket-head">
        <span>{isMfr ? t.dtc.manufacturer : t.dtc.generic}</span>
        <span dir="ltr">{r.parsed.format}{r.parsed.failureType ? ` · FTB ${r.parsed.failureType}` : ""}</span>
      </div>
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-3">
          {full && !def ? <h1 className="sr-only">{r.parsed.code}</h1> : null}
          <CodeTag code={r.parsed.code} size="lg" />
          <Stamp tone={statusTone[r.status]}>{t.dtc.status[r.status]}</Stamp>
          {def ? def.reviewStatus === "reviewed" ? <Stamp tone="ok">{t.dtc.reviewedStamp}</Stamp> : <Stamp tone="warn">{t.dtc.unreviewed}</Stamp> : null}
          {def && def.safetyArea !== "none" ? <Stamp tone="danger">{t.dtc.safety}</Stamp> : null}
        </div>

        {def ? (
          <div>
            {full ? <h1 className="text-3xl font-bold">{locale === "ar" ? def.titleAr : def.titleEn}</h1> : <h2 className="text-2xl font-bold">{locale === "ar" ? def.titleAr : def.titleEn}</h2>}
            {locale === "ar" ? <p className="mt-0.5 text-sm text-ink-3" dir="ltr">{def.titleEn}</p> : null}
          </div>
        ) : null}

        <Notice tone={r.status === "covered" ? "info" : "warn"} title={t.dtc.coverageLimits}>
          {t.dtc.explanation[r.explanation]}
        </Notice>

        {r.conflicts.length ? <Notice tone="warn">{t.dtc.conflict}</Notice> : null}
        {isMfr && r.status !== "covered" ? (
          <p className="text-sm text-ink-2">
            {t.dtc.demandNote} <Link className="link" href="/guides">{t.kb.guidesTitle}</Link>
          </p>
        ) : null}

        {def ? (
          <>
            <section>
              <h3 className="label-mono mb-1">{t.dtc.meaning}</h3>
              <p className="text-[1.05rem]">{locale === "ar" ? def.meaningAr : def.meaningEn}</p>
            </section>

            {def.safetyArea !== "none" ? <Notice tone="danger">{t.dtc.safetyNote}</Notice> : null}

            <div className="grid gap-5 md:grid-cols-2">
              <section>
                <h3 className="label-mono mb-2">{t.dtc.symptoms}</h3>
                <ul className="space-y-1.5">
                  {def.symptoms.map((s, i) => (
                    <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 bg-ink" />{L(s)}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="label-mono mb-2">{t.dtc.causes}</h3>
                <ol className="space-y-1.5">
                  {def.causes.map((c, i) => (
                    <li key={i} className="flex gap-2"><span className="font-mono text-xs leading-7 text-ink-3" dir="ltr">{String(i + 1).padStart(2, "0")}</span>{L(c)}</li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-ink-3">{t.dtc.causesNote}</p>
              </section>
            </div>

            {full ? (
              <section>
                <h3 className="label-mono mb-2">{t.dtc.checks}</h3>
                <ol className="divide-y divide-dashed divide-rule border-y border-rule">
                  {def.checks.map((c, i) => (
                    <li key={c.id} className="grid gap-1 py-3 sm:grid-cols-[2.5rem_1fr_auto]">
                      <span className="text-xl font-bold text-signal" dir="ltr">{i + 1}</span>
                      <div>
                        <p className="font-medium">{locale === "ar" ? c.ar : c.en}</p>
                        <p className="text-sm text-ink-2"><span className="text-ink-3">{t.dtc.expected}: </span>{locale === "ar" ? c.expectedAr : c.expectedEn}</p>
                        {c.tools.length ? <p className="text-xs text-ink-3">{t.dtc.tools}: {c.tools.join("، ")}</p> : null}
                        {(locale === "ar" ? c.onFailAr : c.onFailEn) ? <p className="text-xs text-warn">{t.dtc.onFail}: {locale === "ar" ? c.onFailAr : c.onFailEn}</p> : null}
                      </div>
                      <Stamp tone={c.where === "home" ? "ok" : c.where === "workshop" ? "info" : "danger"} className="self-start">{t.dtc.where[c.where]}</Stamp>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {full && def.fixes.length ? (
              <section className="border border-rule bg-paper-2 p-4">
                <h3 className="label-mono mb-2">{t.dtc.fixes}</h3>
                <ul className="space-y-1.5">
                  {def.fixes.map((f, i) => (
                    <li key={i} className="flex gap-2"><Icon name="wrench" size={16} className="mt-1 shrink-0 text-ink-3" />{L(f)}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-ink-3">{t.dtc.fixesNote}</p>
              </section>
            ) : null}

            <section className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-dashed border-rule pt-4 text-sm">
              <span><span className="text-ink-3">{t.dtc.skill}: </span><strong>{t.dtc.skillLevel[def.skillLevel]}</strong></span>
              <span className="flex items-center gap-1.5">
                <Icon name="book" size={16} className="text-ink-3" />
                <span className="text-ink-3">{t.dtc.sources}:</span> {def.source.providerName} · <Ltr>{def.version}</Ltr> · {fmtDate(def.source.fetchedAt, locale)}
              </span>
            </section>
          </>
        ) : null}

        {r.external.length ? (
          <section className="space-y-2">
            {r.external.map((e) => (
              <div key={e.provider} className="border border-dashed border-rule p-3 text-sm">
                <p className="label-mono">{t.dtc.external} · <span dir="ltr">{e.provider}</span></p>
                <p dir="ltr" className="text-start">{e.description}</p>
              </div>
            ))}
          </section>
        ) : null}

        {r.coverage.length ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-2">{t.dtc.coverageLimits}</summary>
            <ul className="mt-2 space-y-1">
              {r.coverage.map((c, i) => (
                <li key={i} className="flex flex-wrap gap-2"><Ltr className="text-xs">{c.provider}</Ltr><Stamp tone="neutral">{c.status}</Stamp><span className="text-ink-3">{c.note}</span></li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          {!full ? (
            <Link href={`/codes/${encodeURIComponent(r.parsed.code)}${vehicleId ? `?vehicleId=${vehicleId}` : ""}`} className="btn btn-sm">{t.search.openCode}</Link>
          ) : null}
          <Link href={`/diagnose/new?codes=${encodeURIComponent(r.parsed.raw)}${vehicleId ? `&vehicleId=${vehicleId}` : ""}`} className="btn btn-primary btn-sm">{t.dtc.startDiagnosis}</Link>
        </div>
      </div>
    </article>
  );
}
