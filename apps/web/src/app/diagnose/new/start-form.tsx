"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { extractDtcs } from "@autocare/contracts";
import { FormError, Textarea, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { api } from "@/lib/api-client";

export function StartForm({ vehicles, initialCodes, initialVehicle, initialSymptoms = "" }: { vehicles: Array<{ id: string; label: string }>; initialCodes: string; initialVehicle?: string; initialSymptoms?: string }) {
  const { t } = useT();
  const router = useRouter();
  const { pending, error, fields, run } = useSubmit<{ session: { id: string } }>();
  const [vehicleId, setVehicleId] = useState(vehicles.find((v) => v.id === initialVehicle)?.id ?? vehicles[0]!.id);
  const [codes, setCodes] = useState(initialCodes);
  const parsed = useMemo(() => extractDtcs(codes), [codes]);

  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const list = codes.split(/[\s,،;]+/).map((c) => c.trim()).filter(Boolean).slice(0, 20);
        const r = await run(() => api<{ session: { id: string } }>("/diagnostics", { body: { vehicleId, codes: list, symptoms: String(fd.get("symptoms") ?? "") } }));
        if (r) router.push(`/diagnose/${r.session.id}`);
      }}
    >
      <FormError error={error} />
      <fieldset>
        <legend className="field-label">{t.diagnose.chooseVehicle}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {vehicles.map((v) => (
            <label key={v.id} className={`ticket flex cursor-pointer items-center gap-3 p-3 ${vehicleId === v.id ? "outline-2 outline-signal" : ""}`}>
              <input type="radio" name="vehicle" value={v.id} checked={vehicleId === v.id} onChange={() => setVehicleId(v.id)} className="accent-[var(--signal)]" />
              <span className="font-semibold">{v.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="codes" className="field-label">{t.diagnose.codes}</label>
        <input id="codes" className="field ltr-id text-start" dir="ltr" value={codes} onChange={(e) => setCodes(e.target.value)} maxLength={300} placeholder="P0301, P0171" autoComplete="off" spellCheck={false} />
        <p className="field-hint">{t.diagnose.codesHint}</p>
        {parsed.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {parsed.map((p) => <span key={p.code + (p.failureType ?? "")} className="code-tag text-xs">{p.code}{p.failureType ? `-${p.failureType}` : ""}</span>)}
          </div>
        ) : null}
      </div>
      <Textarea label={t.diagnose.symptoms} name="symptoms" maxLength={2000} rows={4} placeholder={t.diagnose.symptomsPh} fields={fields} defaultValue={initialSymptoms} />
      <button className="btn btn-primary" disabled={pending}>{pending ? t.common.loading : t.common.next}</button>
    </form>
  );
}
