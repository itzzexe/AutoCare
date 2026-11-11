"use client";

import Link from "next/link";
import { useState } from "react";
import { FormError, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { Notice, Stamp } from "@/components/ui/bits";
import { Icon } from "@/components/ui/icon";
import { api } from "@/lib/api-client";
import type { RulesResult } from "@/server/modules/diagnostics/rules";

export interface ResultData {
  rules: RulesResult;
  model: null | {
    summary: string;
    likelyCauses: Array<{ cause: string; evidence: string[]; sourceIds: string[] }>;
    missingInformation: string[];
    nextCheck: string | null;
    workshopAdvice: string | null;
    conditionalParts: Array<{ part: string; onlyIf: string }>;
    insufficientEvidence: boolean;
  };
  modelStatus: string;
  modelStatusDetail?: string | null;
  sources: Array<{ ref: string; title: string; kind: string }>;
  rulesVersion: string;
  modelName: string | null;
  promptVersion: string | null;
  generatedAt: string;
}

const URG_STYLE: Record<string, { band: string; tone: "danger" | "warn" | "info" | "ok" | "neutral" }> = {
  stop_driving: { band: "hazard red", tone: "danger" },
  urgent: { band: "hazard", tone: "danger" },
  soon: { band: "bg-warn h-2", tone: "warn" },
  monitor: { band: "bg-ok h-2", tone: "ok" },
  insufficient_info: { band: "bg-rule h-2", tone: "neutral" },
};

export function ResultView({ data, sessionId, vehicleId, onRegenerate, regenerating }: { data: ResultData; sessionId: string; vehicleId: string; onRegenerate: () => void; regenerating: boolean }) {
  const { t, locale } = useT();
  const r = data.rules;
  const u = URG_STYLE[r.urgency] ?? URG_STYLE.insufficient_info!;
  const m = data.model;
  const nextCheck = r.orderedChecks.find((c) => c.id === r.nextCheckId);

  return (
    <div className="space-y-6">
      {/* Urgency — decided by rules */}
      <section className="ticket overflow-hidden rise">
        <div className={u.band} />
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div>
            <p className="label-mono">{t.diagnose.stepResult}</p>
            <h2 className="mt-1 text-3xl font-bold sm:text-4xl">{t.diagnose.urgency[r.urgency]}</h2>
            <p className="mt-1 max-w-xl text-lg text-ink-2">{t.diagnose.urgencyLead[r.urgency]}</p>
          </div>
          <Stamp tone={u.tone} className="stamp-in text-base">{t.diagnose.urgency[r.urgency]}</Stamp>
        </div>
        {r.hits.length ? (
          <div className="border-t border-dashed border-rule px-5 py-4 sm:px-6">
            <p className="label-mono mb-2">{t.diagnose.rulesFired}</p>
            <ul className="space-y-1.5 text-sm">
              {r.hits.map((h) => (
                <li key={h.id} className="flex gap-2">
                  <Icon name="alert" size={16} className="mt-1 shrink-0 text-danger" />
                  <span>{locale === "ar" ? h.ar : h.en}</span>
                  <span className="ltr-id text-[0.7rem] text-ink-3">{h.id}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-3">{t.diagnose.rulesNote}</p>
          </div>
        ) : null}
      </section>

      {/* Model explanation or honest reason for its absence */}
      {m && data.modelStatus === "ok" ? (
        <section className="ticket rise rise-1">
          <div className="ticket-head"><span>{t.diagnose.assistantNote}</span><span dir="ltr">{data.modelName}</span></div>
          <div className="space-y-5 p-5 sm:p-6">
            <p className="text-[1.05rem] leading-8">{m.summary}</p>
            {m.insufficientEvidence ? <Notice tone="warn">{t.diagnose.insufficient}</Notice> : null}
            {m.likelyCauses.length ? (
              <div>
                <h3 className="label-mono mb-2">{t.diagnose.likely}</h3>
                <ol className="space-y-3">
                  {m.likelyCauses.map((c, i) => (
                    <li key={i} className="border-s-2 border-ink ps-3">
                      <p className="font-semibold">{c.cause} {c.sourceIds.map((s) => <sup key={s} className="ms-1 font-mono text-[0.65rem] text-info" dir="ltr">[{s}]</sup>)}</p>
                      {c.evidence.length ? <ul className="mt-1 text-sm text-ink-2">{c.evidence.map((e, j) => <li key={j}>— {e}</li>)}</ul> : null}
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-ink-3">{t.dtc.causesNote}</p>
              </div>
            ) : null}
            {m.conditionalParts.length ? (
              <div className="border border-dashed border-warn bg-warn-soft p-4">
                <h3 className="label-mono mb-2">{t.diagnose.parts}</h3>
                <ul className="space-y-1 text-sm">
                  {m.conditionalParts.map((p, i) => <li key={i}><strong>{p.part}</strong> — {t.diagnose.partsOnlyIf}: {p.onlyIf}</li>)}
                </ul>
              </div>
            ) : null}
            {m.nextCheck ? <p><span className="label-mono">{t.diagnose.nextCheck}: </span>{m.nextCheck}</p> : null}
            {m.workshopAdvice ? <p><span className="label-mono">{t.diagnose.workshop}: </span>{m.workshopAdvice}</p> : null}
          </div>
        </section>
      ) : (
        <Notice tone={data.modelStatus === "skipped_safety" ? "danger" : "info"}>
          {(t.diagnose.noModel as Record<string, string>)[data.modelStatus] ?? t.diagnose.noModel.unavailable}
          {data.modelStatusDetail === "daily_quota" ? ` (${t.errors.rate_limited})` : ""}
          {data.modelStatusDetail && data.modelStatusDetail !== "daily_quota" && data.modelStatusDetail !== "plan_allowance" ? <span className="ms-1 ltr-id text-xs text-ink-3">[{data.modelStatusDetail}]</span> : null}
          {data.modelStatusDetail === "plan_allowance" ? (
            <span className="mt-1 block">
              {t.billing.planLimitAi} <Link className="link font-semibold" href="/pricing">{t.billing.upgrade}</Link>
            </span>
          ) : null}
        </Notice>
      )}

      {/* Rules-based next step and workshop advice — always present */}
      <section className="grid gap-4 md:grid-cols-2 rise rise-2">
        <div className="ticket p-5">
          <p className="label-mono mb-1">{t.diagnose.nextCheck}</p>
          {nextCheck ? (
            <>
              <p className="font-semibold">{locale === "ar" ? nextCheck.ar : nextCheck.en}</p>
              <p className="text-sm text-ink-2">{t.dtc.expected}: {locale === "ar" ? nextCheck.expectedAr : nextCheck.expectedEn}</p>
              <Stamp tone={nextCheck.where === "home" ? "ok" : "info"} className="mt-2">{t.dtc.where[nextCheck.where]}</Stamp>
            </>
          ) : <p className="text-ink-3">—</p>}
        </div>
        <div className="ticket p-5">
          <p className="label-mono mb-1">{t.diagnose.workshop}</p>
          <p className="font-semibold">{locale === "ar" ? r.workshop.reasonAr : r.workshop.reasonEn}</p>
          {r.workshop.recommended ? (
            <Link href={`/workshops${r.workshop.specialty ? `?specialty=${r.workshop.specialty}` : ""}`} className="btn btn-sm mt-3">{t.diagnose.bookWorkshop}</Link>
          ) : null}
        </div>
      </section>

      {r.missingInformation.length || (m?.missingInformation.length ?? 0) ? (
        <section className="ticket p-5">
          <p className="label-mono mb-2">{t.diagnose.missing}</p>
          <ul className="space-y-1 text-sm">
            {r.missingInformation.map((x) => <li key={x.id}>• {locale === "ar" ? x.ar : x.en}</li>)}
            {m?.missingInformation.map((x, i) => <li key={`m${i}`}>• {x}</li>)}
          </ul>
        </section>
      ) : null}

      {/* Sources & provenance */}
      <section className="ticket p-5 text-sm">
        <p className="label-mono mb-2">{t.diagnose.sources}</p>
        {data.modelStatus === "ok" && data.sources.length ? (
          <ul className="space-y-1">
            {data.sources.map((s) => <li key={s.ref}><span className="ltr-id text-info">[{s.ref}]</span> <bdi>{s.title}</bdi> <Stamp tone="neutral" className="ms-1">{(t.diagnose.sourceKinds as Record<string, string>)[s.kind] ?? s.kind}</Stamp></li>)}
          </ul>
        ) : (
          <p className="text-ink-3">{r.codeCoverage.length ? r.codeCoverage.map((c) => `${c.code}: ${t.dtc.status[c.status]}`).join(" · ") : t.diagnose.noSources}</p>
        )}
        <details className="mt-3 text-xs text-ink-3">
          <summary className="cursor-pointer">{t.diagnose.meta}</summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4" dir="ltr">
            <dt>rules</dt><dd>{data.rulesVersion}</dd>
            <dt>model</dt><dd>{data.modelName ?? "—"} ({data.modelStatus})</dd>
            <dt>prompt</dt><dd>{data.promptVersion ?? "—"}</dd>
            <dt>at</dt><dd>{data.generatedAt}</dd>
          </dl>
        </details>
      </section>

      <div className="flex flex-wrap gap-2">
        <a className="btn" href={`/api/v1/diagnostics/${sessionId}/report.pdf?locale=${locale}`}><Icon name="doc" size={18} />{t.diagnose.pdf}</a>
        <Link className="btn" href={`/cases/new?sessionId=${sessionId}&vehicleId=${vehicleId}`}>{t.diagnose.submitCase}</Link>
        <button type="button" className="btn btn-ghost" onClick={onRegenerate} disabled={regenerating}>{regenerating ? t.diagnose.generating : t.diagnose.redo}</button>
      </div>

      <SharePanel sessionId={sessionId} />
    </div>
  );
}

function SharePanel({ sessionId }: { sessionId: string }) {
  const { t } = useT();
  const { pending, error, run } = useSubmit<{ id: string; url: string; expiresAt: string }>();
  const [link, setLink] = useState<{ id: string; url: string; expiresAt: string } | null>(null);
  const [hours, setHours] = useState(72);
  const [copied, setCopied] = useState(false);
  return (
    <section className="ticket p-5">
      <h3 className="mb-1 flex items-center gap-2 text-lg font-bold"><Icon name="share" size={18} />{t.diagnose.share}</h3>
      <p className="mb-3 text-sm text-ink-2">{t.diagnose.shareLead}</p>
      <FormError error={error} />
      {link ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <code className="ltr-id max-w-full overflow-x-auto border border-rule bg-paper-2 px-2 py-1 text-xs">{link.url}</code>
            <button type="button" className="btn btn-sm" onClick={async () => { await navigator.clipboard.writeText(link.url); setCopied(true); }}>{copied ? t.common.copied : t.common.copy}</button>
            <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={async () => { await run(() => api(`/shares/${link.id}`, { method: "DELETE" })); setLink(null); }}>{t.diagnose.shareRevoke}</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="field-label">{t.diagnose.shareHours}</span>
            <select className="field w-auto" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {[24, 72, 168, 336].map((h) => <option key={h} value={h}>{h / 24} d</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-sm" disabled={pending} onClick={async () => { const r = await run(() => api(`/diagnostics/${sessionId}/shares`, { body: { ttlHours: hours } })); if (r) setLink(r); }}>{t.diagnose.shareCreate}</button>
        </div>
      )}
    </section>
  );
}
