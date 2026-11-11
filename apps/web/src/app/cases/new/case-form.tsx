"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError, Input, Select, Textarea, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { Stamp } from "@/components/ui/bits";
import { api } from "@/lib/api-client";

export function CaseForm({ vehicles, sessionId, vehicleId }: { vehicles: Array<{ id: string; label: string }>; sessionId?: string; vehicleId?: string }) {
  const { t } = useT();
  const router = useRouter();
  const { pending, error, fields, run } = useSubmit<unknown>();
  const upload = useSubmit<{ id: string; status: string }>();
  const [attachments, setAttachments] = useState<Array<{ id: string; status: string }>>([]);

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const s = (k: string) => String(fd.get(k) ?? "").trim();
        const cost = s("cost");
        const ok = await run(() =>
          api("/cases", {
            body: {
              vehicleId: s("vehicleId") || undefined,
              diagnosticSessionId: sessionId,
              codes: s("codes").split(/[\s,،]+/).filter(Boolean).slice(0, 20),
              symptoms: s("symptoms"),
              confirmedCause: s("confirmedCause") || undefined,
              confirmedBy: s("confirmedBy"),
              repairPerformed: s("repair") || undefined,
              partsReplaced: s("parts").split(/[,،\n]+/).map((p) => p.trim()).filter(Boolean).slice(0, 20).map((name) => ({ name })),
              repairDate: s("repairDate") || undefined,
              costMinor: cost ? Number(cost) : undefined,
              currency: cost ? "IQD" : undefined,
              outcome: s("outcome"),
              measurements: [],
              attachmentIds: attachments.filter((a) => a.status === "clean").map((a) => a.id),
            },
          }),
        );
        if (ok) {
          router.push("/cases");
          router.refresh();
        }
      }}
    >
      <FormError error={error} />
      <Select label={t.diagnose.chooseVehicle} name="vehicleId" defaultValue={vehicleId ?? vehicles[0]?.id ?? ""} fields={fields}>
        {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
      </Select>
      <Input label={t.diagnose.codes} name="codes" ltr maxLength={200} placeholder="P0301" fields={fields} />
      <Textarea label={t.diagnose.symptoms} name="symptoms" maxLength={2000} rows={3} fields={fields} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t.cases.confirmedCause} name="confirmedCause" maxLength={500} fields={fields} />
        <Select label={t.cases.confirmedBy} name="confirmedBy" defaultValue="mechanic">
          {(["mechanic", "dealer", "owner", "unknown"] as const).map((k) => <option key={k} value={k}>{t.cases.confirmedByList[k]}</option>)}
        </Select>
        <Input label={t.cases.repair} name="repair" maxLength={1000} fields={fields} />
        <Input label={t.cases.parts} name="parts" maxLength={500} fields={fields} />
        <Input label={t.common.date} name="repairDate" type="date" ltr fields={fields} />
        <Input label={`${t.garage.cost} (${t.common.iqd})`} name="cost" type="number" min={0} ltr fields={fields} />
        <Select label={t.cases.outcome} name="outcome" defaultValue="resolved">
          {(["resolved", "partially", "persisted", "unknown"] as const).map((k) => <option key={k} value={k}>{t.cases.outcomes[k]}</option>)}
        </Select>
      </div>
      <div>
        <label className="field-label" htmlFor="file">{t.common.optional}: JPEG / PNG / WebP / PDF · ≤ 8MB</label>
        <input
          id="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="block text-sm"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const r = await upload.run(() => api<{ id: string; status: string }>("/uploads?purpose=case_attachment", { raw: f }));
            if (r) setAttachments((a) => [...a, r]);
            e.target.value = "";
          }}
        />
        <FormError error={upload.error} />
        <div className="mt-2 flex flex-wrap gap-2">
          {attachments.map((a) => <Stamp key={a.id} tone={a.status === "clean" ? "ok" : "warn"}>{a.status}</Stamp>)}
        </div>
      </div>
      <button className="btn btn-primary" disabled={pending}>{pending ? t.common.loading : t.common.save}</button>
    </form>
  );
}
