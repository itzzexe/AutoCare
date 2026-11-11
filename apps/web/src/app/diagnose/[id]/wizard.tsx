"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONDITIONS, ONSET, WARNING_LIGHTS } from "@autocare/contracts";
import { FormError, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { Stamp } from "@/components/ui/bits";
import { api } from "@/lib/api-client";
import type { RulesResult } from "@/server/modules/diagnostics/rules";
import { ResultView, type ResultData } from "./result-view";

type Step = "codes" | "context" | "checks" | "result";
interface Props {
  locale: "ar" | "en";
  session: { id: string; step: Step; codes: Array<{ code: string; raw: string; scope: string }>; symptoms: string; context: Record<string, unknown> };
  vehicle: { id: string; label: string };
  preview: RulesResult;
  latest: null | { rules: unknown; model: unknown; modelStatus: string; rulesVersion: string; modelName: string | null; promptVersion: string | null; createdAt: string };
}

const STEPS: Step[] = ["context", "checks", "result"];

export function Wizard({ session, vehicle, preview, latest, locale }: Props) {
  const { t } = useT();
  const router = useRouter();
  const [step, setStep] = useState<Step>(latest ? "result" : session.step === "codes" ? "context" : session.step);
  const [result, setResult] = useState<ResultData | null>(
    latest ? { rules: latest.rules as RulesResult, model: latest.model as ResultData["model"], modelStatus: latest.modelStatus, sources: [], rulesVersion: latest.rulesVersion, modelName: latest.modelName, promptVersion: latest.promptVersion, generatedAt: latest.createdAt } : null,
  );
  const ctx = session.context as { onset?: string; conditions?: string[]; warningLights?: string[]; recentMaintenance?: string };
  const [onset, setOnset] = useState(ctx.onset ?? "");
  const [conds, setConds] = useState<string[]>(ctx.conditions ?? []);
  const [lights, setLights] = useState<string[]>(ctx.warningLights ?? []);
  const [checks, setChecks] = useState<Record<string, string>>(Object.fromEntries(preview.orderedChecks.map((c) => [c.id, c.status])));
  const save = useSubmit<unknown>();
  const gen = useSubmit<ResultData>();
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
      {/* Session summary rail */}
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="ticket">
          <div className="ticket-head"><span>{t.diagnose.title}</span><span dir="ltr">DX-{session.id.slice(0, 6).toUpperCase()}</span></div>
          <div className="space-y-3 p-4 text-sm">
            <p className="font-semibold">{vehicle.label}</p>
            <div className="flex flex-wrap gap-1.5">{session.codes.map((c) => <span key={c.code} className="code-tag text-[0.7rem]">{c.code}</span>)}</div>
            {session.symptoms ? <p className="text-ink-2">“{session.symptoms}”</p> : null}
          </div>
        </div>
        <ol className="flex gap-2 lg:flex-col" aria-label="steps">
          {STEPS.map((s, i) => {
            const label = s === "context" ? t.diagnose.stepContext : s === "checks" ? t.diagnose.stepChecks : t.diagnose.stepResult;
            const active = s === step;
            return (
              <li key={s} className="flex-1">
                <button type="button" onClick={() => (s !== "result" || result) && setStep(s)} aria-current={active ? "step" : undefined} className={`flex w-full items-center gap-3 border-s-4 px-3 py-2 text-start text-sm ${active ? "border-signal bg-card font-semibold" : "border-rule text-ink-3"}`}>
                  <span className="font-mono text-xs" dir="ltr">0{i + 1}</span>{label}
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      <div className="min-w-0">
        {step === "context" ? (
          <form
            className="ticket space-y-6 p-5 sm:p-6"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const related = String(fd.get("related") ?? "").split(/[\s,،]+/).filter(Boolean).slice(0, 20);
              const ok = await save.run(() => api(`/diagnostics/${session.id}/context`, { method: "PUT", body: { onset: onset || undefined, conditions: conds, warningLights: lights, recentMaintenance: String(fd.get("recent") ?? "") || undefined, relatedCodes: related.length ? related : undefined } }));
              if (ok) {
                router.refresh();
                setStep("checks");
              }
            }}
          >
            <FormError error={save.error} />
            <fieldset>
              <legend className="field-label">{t.diagnose.onset}</legend>
              <div className="flex flex-wrap gap-2">
                {ONSET.map((o) => <button key={o} type="button" className="chip" aria-pressed={onset === o} onClick={() => setOnset(o)}>{t.diagnose.onsets[o]}</button>)}
              </div>
            </fieldset>
            <fieldset>
              <legend className="field-label">{t.diagnose.conditions}</legend>
              <div className="flex flex-wrap gap-2">
                {CONDITIONS.map((c) => <button key={c} type="button" className="chip" aria-pressed={conds.includes(c)} onClick={() => setConds(toggle(conds, c))}>{t.diagnose.conditionList[c]}</button>)}
              </div>
            </fieldset>
            <fieldset>
              <legend className="field-label">{t.diagnose.lights}</legend>
              <div className="flex flex-wrap gap-2">
                {WARNING_LIGHTS.map((l) => (
                  <button key={l} type="button" className="chip" aria-pressed={lights.includes(l)} onClick={() => setLights(toggle(lights, l))}>
                    <span className={`h-2.5 w-2.5 rounded-full ${["oil", "temp", "brake", "ev_system"].includes(l) ? "bg-danger" : ["check_engine", "check_engine_flashing", "abs", "airbag", "steering"].includes(l) ? "bg-warn" : "bg-info"}`} />
                    {t.diagnose.lightList[l]}
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="recent" className="field-label">{t.diagnose.recentMaintenance}</label>
              <input id="recent" name="recent" className="field" maxLength={1000} defaultValue={ctx.recentMaintenance ?? ""} placeholder={t.diagnose.recentMaintenancePh} />
            </div>
            <div>
              <label htmlFor="related" className="field-label">{t.diagnose.relatedCodes}</label>
              <input id="related" name="related" className="field ltr-id text-start" dir="ltr" maxLength={200} placeholder="P0171, P0174" />
            </div>
            <button className="btn btn-primary" disabled={save.pending}>{save.pending ? t.common.loading : t.common.next}</button>
          </form>
        ) : null}

        {step === "checks" ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">{t.diagnose.checksTitle}</h2>
              <p className="text-ink-2">{t.diagnose.checksLead}</p>
            </div>
            {preview.suppressDiy ? (
              <div className="ticket overflow-hidden"><div className="hazard red" /><p className="p-4 font-medium">{t.dtc.safetyNote}</p></div>
            ) : null}
            {preview.orderedChecks.length === 0 ? <p className="ticket p-5 text-ink-2">{t.diagnose.insufficient}</p> : null}
            <ol className="space-y-3" aria-label={t.diagnose.checksTitle}>
              {preview.orderedChecks.map((c, i) => (
                <li key={c.id} className="ticket p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <span className="font-display text-2xl font-bold leading-none text-signal" dir="ltr">{i + 1}</span>
                      <div>
                        <p className="font-semibold">{locale === "ar" ? c.ar : c.en}</p>
                        <p className="text-sm text-ink-2">{t.dtc.expected}: {locale === "ar" ? c.expectedAr : c.expectedEn}</p>
                        {c.tools.length ? <p className="text-xs text-ink-3">{t.dtc.tools}: {c.tools.join("، ")}</p> : null}
                        <p className="mt-1 text-xs text-ink-3">← <span className="ltr-id">{c.fromCode}</span></p>
                      </div>
                    </div>
                    <Stamp tone={c.where === "home" ? "ok" : c.where === "workshop" ? "info" : "danger"} className="shrink-0">{t.dtc.where[c.where]}</Stamp>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={locale === "ar" ? c.ar : c.en}>
                    {(["pass", "fail", "unsure", "not_done"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        className="chip"
                        aria-pressed={checks[c.id] === r}
                        onClick={async () => {
                          setChecks({ ...checks, [c.id]: r });
                          await save.run(() => api(`/diagnostics/${session.id}/checks`, { body: { checkId: c.id, result: r } }));
                        }}
                      >
                        {r === "pass" ? t.diagnose.pass : r === "fail" ? t.diagnose.fail : r === "unsure" ? t.diagnose.unsure : t.diagnose.notDone}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
            <FormError error={save.error ?? gen.error} />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn btn-primary"
                disabled={gen.pending}
                onClick={async () => {
                  const r = await gen.run(() => api<ResultData>(`/diagnostics/${session.id}/result`, { body: { locale } }));
                  if (r) {
                    setResult(r);
                    setStep("result");
                    router.refresh();
                  }
                }}
              >
                {gen.pending ? t.diagnose.generating : t.diagnose.getResult}
              </button>
              {gen.pending ? <span className="text-sm text-ink-3">{t.diagnose.generatingSlow}</span> : null}
            </div>
            {gen.pending ? (
              <div className="space-y-2" aria-hidden="true">
                <div className="skeleton h-6 w-2/3" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-5/6" />
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "result" && result ? (
          <ResultView
            data={result}
            sessionId={session.id}
            vehicleId={vehicle.id}
            onRegenerate={async () => {
              const r = await gen.run(() => api<ResultData>(`/diagnostics/${session.id}/result`, { body: { locale } }));
              if (r) setResult(r);
            }}
            regenerating={gen.pending}
          />
        ) : null}
      </div>
    </div>
  );
}
