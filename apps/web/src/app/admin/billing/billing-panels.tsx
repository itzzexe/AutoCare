"use client";

import { useRouter } from "next/navigation";
import { FormError, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { useReauth } from "@/components/reauth";
import { Empty, Ltr, Stamp } from "@/components/ui/bits";
import { api } from "@/lib/api-client";

interface Pending { id: string; plan: string; subjectKind: string; subjectId: string; amount: string; createdAt: string }

export function ManualRequests({ items, mfaEnabled }: { items: Pending[]; mfaEnabled: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const { guard, dialog } = useReauth(mfaEnabled);
  const s = useSubmit<unknown>();
  const act = async (fn: () => Promise<unknown>) => {
    if (await s.run(() => guard(fn) as Promise<unknown>)) router.refresh();
  };
  if (!items.length) return <Empty>{t.common.empty}</Empty>;
  return (
    <>
      {dialog}
      <FormError error={s.error} />
      <ul className="ticket divide-y divide-dashed divide-rule">
        {items.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">{x.plan} · {x.amount}</p>
              <p className="text-xs text-ink-3">{x.createdAt} · {x.subjectKind} <Ltr>{x.subjectId.slice(0, 8)}</Ltr></p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary btn-sm" disabled={s.pending} onClick={() => act(() => api(`/admin/billing/subscriptions/${x.id}/confirm`, { body: {} }))}>{t.billing.confirm}</button>
              <button type="button" className="btn btn-ghost btn-sm text-danger" disabled={s.pending} onClick={() => act(() => api(`/admin/billing/subscriptions/${x.id}/reject`, { method: "POST", body: {} }))}>{t.billing.reject}</button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

interface PlanRow { id: string; tier: "free" | "paid"; name: string; priceMinor: number | null; published: boolean; periodDays: number }

export function PlansEditor({ plans, mfaEnabled }: { plans: PlanRow[]; mfaEnabled: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const { guard, dialog } = useReauth(mfaEnabled);
  return (
    <>
      {dialog}
      <ul className="ticket divide-y divide-dashed divide-rule">
        {plans.map((p) => <PlanRowForm key={p.id} p={p} guard={guard} onDone={() => router.refresh()} label={{ price: t.billing.price, published: t.billing.published, save: t.common.save }} />)}
      </ul>
    </>
  );
}

function PlanRowForm({ p, guard, onDone, label }: { p: PlanRow; guard: <T>(fn: () => Promise<T>) => Promise<T | undefined>; onDone: () => void; label: { price: string; published: string; save: string } }) {
  const s = useSubmit<unknown>();
  return (
    <li className="p-4">
      <form
        className="grid items-end gap-3 sm:grid-cols-[1fr_10rem_auto_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const raw = String(fd.get("price") ?? "").trim();
          const body = { priceMinor: p.tier === "free" ? 0 : raw === "" ? null : Number(raw), published: fd.get("published") === "on" };
          if (await s.run(() => guard(() => api(`/admin/billing/plans/${p.id}`, { method: "PATCH", body })) as Promise<unknown>)) onDone();
        }}
      >
        <div>
          <p className="font-semibold">{p.name}</p>
          <p className="text-xs text-ink-3"><Ltr>{p.id}</Ltr> · {p.periodDays}d {p.tier === "free" ? <Stamp tone="neutral">free</Stamp> : null}</p>
          <FormError error={s.error} />
        </div>
        <label className="text-sm">
          <span className="field-label">{label.price}</span>
          <input name="price" type="number" min={0} step={250} defaultValue={p.priceMinor ?? ""} disabled={p.tier === "free"} className="field" dir="ltr" />
        </label>
        <label className="flex items-center gap-2 text-sm"><input name="published" type="checkbox" defaultChecked={p.published} className="accent-[var(--signal)]" /> {label.published}</label>
        <button className="btn btn-sm" disabled={s.pending}>{label.save}</button>
      </form>
    </li>
  );
}
