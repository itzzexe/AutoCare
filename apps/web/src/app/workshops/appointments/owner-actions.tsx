"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { api } from "@/lib/api-client";

export function OwnerApptActions({ id, status }: { id: string; status: string }) {
  const { t } = useT();
  const router = useRouter();
  const { pending, error, run } = useSubmit<unknown>();
  const [rating, setRating] = useState(0);
  const go = async (fn: () => Promise<unknown>) => {
    if (await run(fn)) router.refresh();
  };
  return (
    <div className="flex flex-col gap-2">
      <FormError error={error} />
      {status === "rescheduled" ? <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => go(() => api(`/appointments/${id}`, { method: "PATCH", body: { status: "confirmed" } }))}>{t.common.yes}</button> : null}
      {["requested", "confirmed", "rescheduled"].includes(status) ? <button type="button" className="btn btn-sm" disabled={pending} onClick={() => go(() => api(`/appointments/${id}`, { method: "PATCH", body: { status: "cancelled" } }))}>{t.common.cancel}</button> : null}
      {status === "completed" ? (
        <div className="flex gap-1" role="radiogroup" aria-label={t.market.review}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} disabled={pending || rating > 0} className={`h-8 w-8 border ${rating >= n ? "border-ink bg-signal text-[var(--signal-ink)]" : "border-rule"}`} onClick={async () => { setRating(n); await go(() => api(`/appointments/${id}/review`, { body: { rating: n, body: "" } })); }}>{n}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
