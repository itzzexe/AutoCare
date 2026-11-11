"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney, type CurrencyCode } from "@autocare/contracts";
import { FormError, Input, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { Empty, Ltr, Stamp } from "@/components/ui/bits";
import { api } from "@/lib/api-client";

interface Rec { id: string; kind: string; performedAt: string; odometer: number | null; notes: string | null; costMinor: number | null; currency: string | null }
interface Rem { id: string; title: string; dueDate: string | null; dueOdometer: number | null; origin: string; status: string }

export function MaintenancePanel({ vehicleId, odometerUnit, records, reminders }: { vehicleId: string; odometerUnit: string; records: Rec[]; reminders: Rem[] }) {
  const { t, locale } = useT();
  const router = useRouter();
  const rec = useSubmit<unknown>();
  const rem = useSubmit<unknown>();
  const [tab, setTab] = useState<"log" | "rem">("log");

  return (
    <section className="ticket">
      <div className="flex border-b border-rule" role="tablist">
        {(["log", "rem"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={`flex-1 px-4 py-3 font-semibold ${tab === k ? "border-b-2 border-signal text-ink" : "text-ink-3"}`}>
            {k === "log" ? t.garage.maintenance : t.garage.reminders}
          </button>
        ))}
      </div>

      {tab === "log" ? (
        <div className="space-y-4 p-5">
          {records.length ? (
            <ol className="relative space-y-4 border-s-2 border-dashed border-rule ps-5">
              {records.map((r) => (
                <li key={r.id} className="relative">
                  <span className="absolute -start-[1.6rem] top-1.5 h-3 w-3 rounded-full border-2 border-ink bg-card" />
                  <p className="font-semibold">{r.kind}</p>
                  <p className="text-sm text-ink-3">
                    <Ltr>{r.performedAt}</Ltr>
                    {r.odometer != null ? <> · <Ltr>{r.odometer.toLocaleString("en")} {odometerUnit}</Ltr></> : null}
                    {r.costMinor != null && r.currency ? <> · {formatMoney(r.costMinor, r.currency as CurrencyCode, locale)}</> : null}
                  </p>
                  {r.notes ? <p className="text-sm text-ink-2">{r.notes}</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <Empty>{t.common.empty}</Empty>
          )}
          <form
            className="grid gap-3 border-t border-dashed border-rule pt-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              const num = (k: string) => (String(fd.get(k) ?? "").trim() ? Number(fd.get(k)) : undefined);
              const ok = await rec.run(() => api(`/vehicles/${vehicleId}/maintenance`, { body: { kind: String(fd.get("kind")), performedAt: String(fd.get("performedAt")), odometer: num("odometer"), costMinor: num("cost"), currency: num("cost") !== undefined ? "IQD" : undefined, notes: String(fd.get("notes") ?? "") || undefined } }));
              if (ok) {
                form.reset();
                router.refresh();
              }
            }}
          >
            <div className="sm:col-span-2"><FormError error={rec.error} /></div>
            <Input label={t.garage.kind} name="kind" required maxLength={80} fields={rec.fields} />
            <Input label={t.garage.performed} name="performedAt" type="date" required ltr fields={rec.fields} />
            <Input label={`${t.garage.odometer} (${odometerUnit})`} name="odometer" type="number" min={0} ltr fields={rec.fields} />
            <Input label={`${t.garage.cost} (${t.common.iqd})`} name="cost" type="number" min={0} ltr fields={rec.fields} />
            <div className="sm:col-span-2"><Input label={t.garage.notes} name="notes" maxLength={1000} fields={rec.fields} /></div>
            <div><button className="btn btn-primary btn-sm" disabled={rec.pending}>{t.garage.addRecord}</button></div>
          </form>
        </div>
      ) : (
        <div className="space-y-4 p-5">
          {reminders.length ? (
            <ul className="divide-y divide-dashed divide-rule">
              {reminders.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className={`font-semibold ${r.status !== "active" ? "text-ink-3 line-through" : ""}`}>{r.title}</p>
                    <p className="text-sm text-ink-3">
                      {r.dueDate ? <><span>{t.garage.dueDate}: </span><Ltr>{r.dueDate}</Ltr></> : null}
                      {r.dueOdometer != null ? <> · {t.garage.dueOdo}: <Ltr>{r.dueOdometer.toLocaleString("en")} {odometerUnit}</Ltr></> : null}
                    </p>
                    <Stamp tone={r.origin === "user" ? "neutral" : "info"}>{r.origin === "user" ? t.garage.reminderUser : t.garage.reminderSource}</Stamp>
                  </div>
                  {r.status === "active" ? (
                    <div className="flex gap-1">
                      <button type="button" className="btn btn-sm" onClick={async () => { await rem.run(() => api(`/reminders/${r.id}`, { method: "PATCH", body: { status: "done" } })); router.refresh(); }}>{t.garage.done}</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await rem.run(() => api(`/reminders/${r.id}`, { method: "PATCH", body: { status: "dismissed" } })); router.refresh(); }}>{t.garage.dismiss}</button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t.common.empty}</Empty>
          )}
          <form
            className="grid gap-3 border-t border-dashed border-rule pt-4 sm:grid-cols-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              const odo = String(fd.get("dueOdometer") ?? "").trim();
              const ok = await rem.run(() => api(`/vehicles/${vehicleId}/reminders`, { body: { title: String(fd.get("title")), dueDate: String(fd.get("dueDate") ?? "") || undefined, dueOdometer: odo ? Number(odo) : undefined } }));
              if (ok) {
                form.reset();
                router.refresh();
              }
            }}
          >
            <div className="sm:col-span-3"><FormError error={rem.error} /></div>
            <Input label={t.garage.kind} name="title" required maxLength={120} fields={rem.fields} />
            <Input label={t.garage.dueDate} name="dueDate" type="date" ltr fields={rem.fields} />
            <Input label={`${t.garage.dueOdo} (${odometerUnit})`} name="dueOdometer" type="number" min={0} ltr fields={rem.fields} />
            <div><button className="btn btn-primary btn-sm" disabled={rem.pending}>{t.garage.addReminder}</button></div>
          </form>
        </div>
      )}
    </section>
  );
}
