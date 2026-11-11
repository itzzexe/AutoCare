"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { api } from "@/lib/api-client";

export function SubOrderActions({ id, status }: { id: string; status: string }) {
  const { t } = useT();
  const router = useRouter();
  const { pending, error, run } = useSubmit<unknown>();
  const [mode, setMode] = useState<"none" | "return" | "review">("none");
  const [text, setText] = useState("");
  const [rating, setRating] = useState(5);
  const act = async (fn: () => Promise<unknown>) => {
    if (await run(fn)) {
      setMode("none");
      router.refresh();
    }
  };
  return (
    <div className="flex min-w-48 flex-col items-stretch gap-2">
      <FormError error={error} />
      {status === "pending" ? <button type="button" className="btn btn-sm" disabled={pending} onClick={() => act(() => api(`/orders/sub/${id}/cancel`, { method: "POST" }))}>{t.market.cancel}</button> : null}
      {status === "delivered" ? (
        <>
          <button type="button" className="btn btn-sm" onClick={() => setMode(mode === "review" ? "none" : "review")}>{t.market.review}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode(mode === "return" ? "none" : "return")}>{t.market.return}</button>
        </>
      ) : null}
      {mode !== "none" ? (
        <div className="space-y-2">
          {mode === "review" ? (
            <div className="flex gap-1" role="radiogroup" aria-label="rating">
              {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={rating === n} className={`h-8 w-8 border ${rating >= n ? "border-ink bg-signal text-[var(--signal-ink)]" : "border-rule"}`} onClick={() => setRating(n)}>{n}</button>)}
            </div>
          ) : null}
          <textarea className="field min-h-20 text-sm" maxLength={mode === "return" ? 500 : 2000} value={text} onChange={(e) => setText(e.target.value)} />
          <button type="button" className="btn btn-primary btn-sm" disabled={pending || (mode === "return" && !text.trim())} onClick={() => act(() => (mode === "return" ? api(`/orders/sub/${id}/return`, { body: { reason: text } }) : api(`/orders/sub/${id}/review`, { body: { rating, body: text } })))}>{t.common.save}</button>
        </div>
      ) : null}
    </div>
  );
}
