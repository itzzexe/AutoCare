"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError, Select, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { Notice } from "@/components/ui/bits";
import { api } from "@/lib/api-client";

interface Props {
  plan: { id: string; audience: "owner" | "workshop" | "merchant"; priceMinor: number };
  gateways: Array<{ id: "qi_card" | "zaincash"; name: string; minAmountIqd: number }>;
  subjects: { merchants: Array<{ id: string; name: string }>; workshops: Array<{ id: string; name: string }> };
}

/** Only HTTPS gateway pages are followed; anything else is treated as an error. */
function safeRedirect(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function SubscribeForm({ plan, gateways, subjects }: Props) {
  const { t } = useT();
  const router = useRouter();
  const { pending, error, run } = useSubmit<{ subscriptionId: string; status: string; redirectUrl: string | null }>();
  const [done, setDone] = useState<"manual" | "redirect" | null>(null);
  const usable = gateways.filter((g) => plan.priceMinor >= g.minAmountIqd);
  const options = plan.audience === "merchant" ? subjects.merchants : plan.audience === "workshop" ? subjects.workshops : [];

  if (done === "manual") return <Notice tone="ok">{t.billing.requested}</Notice>;
  if (done === "redirect") return <Notice tone="info">{t.billing.redirecting}</Notice>;
  if (plan.audience !== "owner" && options.length === 0) return <Notice tone="warn">{t.errors.forbidden}</Notice>;

  return (
    <form
      className="ticket space-y-4 self-start p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const method = String(fd.get("method"));
        const subjectId = plan.audience === "owner" ? undefined : String(fd.get("subject"));
        const r = await run(() => api("/billing/subscribe", { body: { planId: plan.id, subjectKind: plan.audience === "owner" ? "user" : plan.audience, subjectId, method } }));
        if (!r) return;
        const dest = safeRedirect(r.redirectUrl);
        if (dest) {
          setDone("redirect");
          window.location.assign(dest);
        } else {
          setDone("manual");
          router.refresh();
        }
      }}
    >
      <FormError error={error} />
      {plan.audience !== "owner" ? (
        <Select label={t.billing.subject} name="subject" required>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      ) : null}
      <fieldset className="space-y-2">
        <legend className="field-label">{t.billing.method}</legend>
        {usable.map((g, i) => (
          <label key={g.id} className="flex items-center gap-2"><input type="radio" name="method" value={g.id} defaultChecked={i === 0} className="accent-[var(--signal)]" /> {g.name}</label>
        ))}
        <label className="flex items-center gap-2"><input type="radio" name="method" value="manual" defaultChecked={usable.length === 0} className="accent-[var(--signal)]" /> {t.billing.manual}</label>
        {usable.length === 0 ? <p className="field-hint">{t.billing.noGateway}</p> : null}
        <p className="field-hint">{t.billing.manualNote}</p>
      </fieldset>
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? t.common.loading : t.billing.choose}</button>
    </form>
  );
}
