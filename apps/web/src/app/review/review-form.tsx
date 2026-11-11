"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError, Textarea, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { api } from "@/lib/api-client";

export function ReviewForm({ caseId, canVerify }: { caseId: string; canVerify: boolean }) {
  const { t, locale } = useT();
  const router = useRouter();
  const { pending, error, fields, run } = useSubmit<unknown>();
  const [decision, setDecision] = useState<"verified" | "rejected" | "inconclusive" | "needs_review">("needs_review");
  const [noPii, setNoPii] = useState(false);
  return (
    <form
      className="space-y-3 border-s border-dashed border-rule ps-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const evidence = String(fd.get("evidence") ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 10);
        if (await run(() => api(`/review/cases/${caseId}`, { body: { decision, notes: String(fd.get("notes")), evidence } }))) router.refresh();
      }}
    >
      <FormError error={error} />
      <div className="flex flex-wrap gap-2">
        {(["verified", "inconclusive", "needs_review", "rejected"] as const).map((d) => (
          <button key={d} type="button" className="chip" aria-pressed={decision === d} disabled={d === "verified" && !canVerify} onClick={() => setDecision(d)}>{t.cases.status[d]}</button>
        ))}
      </div>
      <Textarea label={t.garage.notes} name="notes" required maxLength={2000} rows={3} fields={fields} />
      <Textarea label={locale === "ar" ? "الأدلة (سطر لكل دليل)" : "Evidence (one per line)"} name="evidence" maxLength={3000} rows={2} fields={fields} />
      {decision === "verified" ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={noPii} onChange={(e) => setNoPii(e.target.checked)} className="mt-1 accent-[var(--signal)]" />
          {locale === "ar" ? "تأكدت أن النص لا يحتوي أسماء أو أرقام هواتف أو لوحات أو عناوين." : "I checked the text contains no names, phone numbers, plates or addresses."}
        </label>
      ) : null}
      <button className="btn btn-primary btn-sm" disabled={pending || (decision === "verified" && !noPii)}>{t.common.save}</button>
    </form>
  );
}
