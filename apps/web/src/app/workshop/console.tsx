"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney, IQ_GOVERNORATES } from "@autocare/contracts";
import { FormError, Input, Select, Textarea, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { Empty, Stamp } from "@/components/ui/bits";
import { api } from "@/lib/api-client";

const SPECIALTIES = ["engine", "transmission", "electrical", "ac", "brakes", "suspension", "body", "hybrid_ev", "diagnostics", "tyres"] as const;

export function ApplyWorkshop() {
  const { t, locale } = useT();
  const router = useRouter();
  const { pending, error, fields, run } = useSubmit<unknown>();
  const [spec, setSpec] = useState<string[]>([]);
  return (
    <form
      className="ticket space-y-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const ok = await run(() => api("/workshop/apply", { body: { name: String(fd.get("name")), governorate: String(fd.get("gov")), city: String(fd.get("city")), address: String(fd.get("address")), phone: String(fd.get("phone")), specialties: spec, brands: String(fd.get("brands") ?? "").split(/[,،]+/).map((b) => b.trim()).filter(Boolean).slice(0, 30) } }));
        if (ok) router.refresh();
      }}
    >
      <FormError error={error} />
      <Input label={locale === "ar" ? "اسم الورشة" : "Workshop name"} name="name" required maxLength={120} fields={fields} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label={t.market.governorate} name="gov" defaultValue="BGD">{IQ_GOVERNORATES.map((g) => <option key={g.code} value={g.code}>{locale === "ar" ? g.ar : g.en}</option>)}</Select>
        <Input label={t.market.city} name="city" required maxLength={80} fields={fields} />
      </div>
      <Input label={t.market.street} name="address" required maxLength={300} fields={fields} />
      <Input label={t.market.phone} name="phone" required ltr maxLength={20} fields={fields} />
      <fieldset>
        <legend className="field-label">{t.workshops.specialty}</legend>
        <div className="flex flex-wrap gap-2">{SPECIALTIES.map((s) => <button key={s} type="button" className="chip" aria-pressed={spec.includes(s)} onClick={() => setSpec(spec.includes(s) ? spec.filter((x) => x !== s) : [...spec, s])}>{t.workshops.specialties[s]}</button>)}</div>
      </fieldset>
      <Input label={t.workshops.brand} name="brands" maxLength={400} placeholder="Toyota, Kia" fields={fields} />
      <button className="btn btn-primary" disabled={pending || !spec.length}>{t.common.save}</button>
    </form>
  );
}

interface A {
  id: string; status: string; preferredAt: string; proposedAt: string | null; note: string | null; vehicle: Record<string, unknown>; hasSharedReport: boolean;
  workOrders: Array<{ id: string; status: string; quoteMinor: number | null; resultNotes: string | null; checks: Array<{ name: string; result: string }> }>;
}
const NEXT: Record<string, string[]> = { requested: ["confirmed", "declined", "rescheduled"], rescheduled: ["confirmed", "declined"], confirmed: ["completed", "no_show", "rescheduled"] };

export function WorkshopConsole({ appointments }: { appointments: A[] }) {
  const { t } = useT();
  if (!appointments.length) return <Empty>{t.common.empty}</Empty>;
  return (
    <ul className="space-y-4">
      {appointments.map((a) => <ApptRow key={a.id} a={a} />)}
    </ul>
  );
}

function ApptRow({ a }: { a: A }) {
  const { t, locale } = useT();
  const router = useRouter();
  const s = useSubmit<unknown>();
  const [report, setReport] = useState<null | { codes: Array<{ code: string }>; symptoms: string; latest: null | { urgency: string; rulesResult: { orderedChecks: Array<{ id: string; ar: string; en: string; status: string }> } } }>(null);
  const [woOpen, setWoOpen] = useState(false);
  const [proposed, setProposed] = useState("");
  const go = async (fn: () => Promise<unknown>) => {
    if (await s.run(fn)) router.refresh();
  };
  return (
    <li className="ticket">
      <div className="ticket-head"><span>{new Date(a.preferredAt).toLocaleString(locale === "ar" ? "ar-IQ" : "en-GB", { timeZone: "Asia/Baghdad" })}</span><Stamp tone="info">{t.workshops.apptStatus[a.status as keyof typeof t.workshops.apptStatus]}</Stamp></div>
      <div className="space-y-3 p-4">
        <p className="font-semibold">{String(a.vehicle.make)} {String(a.vehicle.model)} {String(a.vehicle.year)} <span className="text-sm font-normal text-ink-3">{String(a.vehicle.engine ?? "")}</span></p>
        {a.note ? <p className="text-sm text-ink-2">“{a.note}”</p> : null}
        <FormError error={s.error} />
        <div className="flex flex-wrap items-end gap-2">
          {(NEXT[a.status] ?? []).map((n) =>
            n === "rescheduled" ? (
              <span key={n} className="flex items-end gap-1">
                <input type="datetime-local" className="field w-auto" value={proposed} onChange={(e) => setProposed(e.target.value)} dir="ltr" aria-label={t.workshops.apptStatus.rescheduled} />
                <button type="button" className="btn btn-sm" disabled={!proposed || s.pending} onClick={() => go(() => api(`/appointments/${a.id}`, { method: "PATCH", body: { status: n, proposedAt: new Date(proposed).toISOString() } }))}>{t.workshops.apptStatus.rescheduled}</button>
              </span>
            ) : (
              <button key={n} type="button" className="btn btn-sm" disabled={s.pending} onClick={() => go(() => api(`/appointments/${a.id}`, { method: "PATCH", body: { status: n } }))}>{t.workshops.apptStatus[n as keyof typeof t.workshops.apptStatus]}</button>
            ),
          )}
          {a.hasSharedReport ? <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { const r = await s.run(() => api(`/workshop/appointments/${a.id}/report`)); if (r) setReport(r as never); }}>{t.diagnose.share}</button> : null}
          {["confirmed", "completed"].includes(a.status) ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWoOpen(!woOpen)}>+ Work order</button> : null}
        </div>
        {report ? (
          <div className="border border-dashed border-rule p-3 text-sm">
            <div className="mb-1 flex flex-wrap gap-1">{report.codes.map((c) => <span key={c.code} className="code-tag text-xs">{c.code}</span>)}</div>
            {report.symptoms ? <p className="text-ink-2">“{report.symptoms}”</p> : null}
            {report.latest ? <p className="mt-1"><Stamp tone="warn">{t.diagnose.urgency[report.latest.urgency as keyof typeof t.diagnose.urgency]}</Stamp></p> : null}
            {report.latest ? <ol className="mt-2 list-inside list-decimal">{report.latest.rulesResult.orderedChecks.map((c) => <li key={c.id}>{locale === "ar" ? c.ar : c.en} — {c.status}</li>)}</ol> : null}
          </div>
        ) : null}
        {a.workOrders.map((w) => (
          <div key={w.id} className="border-s-2 border-ink ps-3 text-sm">
            <p><Stamp tone="neutral">{w.status}</Stamp> {w.quoteMinor != null ? formatMoney(w.quoteMinor, "IQD", locale) : ""}</p>
            {w.checks.map((c, i) => <p key={i} className="text-ink-2">{c.name}: {c.result}</p>)}
            {w.resultNotes ? <p>{w.resultNotes}</p> : null}
          </div>
        ))}
        {woOpen ? (
          <form
            className="grid gap-3 border-t border-dashed border-rule pt-3 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const quote = String(fd.get("quote") ?? "").trim();
              await go(() => api("/workshop/work-orders", { body: { appointmentId: a.id, checks: String(fd.get("check") ?? "").trim() ? [{ name: String(fd.get("check")), result: String(fd.get("result") ?? "—") || "—" }] : [], quoteMinor: quote ? Number(quote) : undefined, currency: quote ? "IQD" : undefined, resultNotes: String(fd.get("notes") ?? "") || undefined, status: String(fd.get("status")) } }));
              setWoOpen(false);
            }}
          >
            <Input label={t.diagnose.stepChecks} name="check" maxLength={120} />
            <Input label={t.diagnose.fail} name="result" maxLength={300} />
            <Input label={`${t.market.total} (${t.common.iqd})`} name="quote" type="number" min={0} ltr />
            <Select label={t.common.status} name="status" defaultValue="quoted">{["open", "quoted", "in_progress", "done"].map((x) => <option key={x} value={x}>{x}</option>)}</Select>
            <div className="sm:col-span-2"><Textarea label={t.garage.notes} name="notes" maxLength={2000} rows={2} /></div>
            <div><button className="btn btn-primary btn-sm" disabled={s.pending}>{t.common.save}</button></div>
          </form>
        ) : null}
      </div>
    </li>
  );
}
