"use client";

import { useRouter } from "next/navigation";
import { FormError, Input, Select, Textarea, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { api } from "@/lib/api-client";

export function BookingForm({ workshopId, vehicles, sessions }: { workshopId: string; vehicles: Array<{ id: string; label: string }>; sessions: Array<{ id: string; label: string }> }) {
  const { t } = useT();
  const router = useRouter();
  const { pending, error, fields, run } = useSubmit<unknown>();
  const min = new Date(Date.now() + 60 * 60_000).toISOString().slice(0, 16);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const local = String(fd.get("when"));
        const share = String(fd.get("share") ?? "");
        const ok = await run(() => api("/appointments", { body: { workshopId, vehicleId: String(fd.get("vehicleId")), preferredAt: new Date(local).toISOString(), note: String(fd.get("note") ?? "") || undefined, shareDiagnosticSessionId: share || undefined } }));
        if (ok) router.push("/workshops/appointments");
      }}
    >
      <FormError error={error} />
      <Select label={t.diagnose.chooseVehicle} name="vehicleId" fields={fields}>
        {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
      </Select>
      <Input label={t.workshops.when} name="when" type="datetime-local" min={min} required ltr fields={fields} />
      <Select label={t.workshops.shareReport} name="share" defaultValue="" hint={t.diagnose.shareLead}>
        <option value="">{t.workshops.noShare}</option>
        {sessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </Select>
      <Textarea label={t.garage.notes} name="note" maxLength={500} rows={3} fields={fields} />
      <button className="btn btn-primary w-full" disabled={pending}>{t.workshops.book}</button>
    </form>
  );
}
