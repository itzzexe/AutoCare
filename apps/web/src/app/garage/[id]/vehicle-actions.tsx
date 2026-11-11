"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { useReauth } from "@/components/reauth";
import { Ltr } from "@/components/ui/bits";
import { api } from "@/lib/api-client";

export function VehicleActions({ vehicleId, hasVin, mfaEnabled }: { vehicleId: string; hasVin: boolean; mfaEnabled: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const { guard, dialog } = useReauth(mfaEnabled);
  const { pending, error, run } = useSubmit<unknown>();
  const [vin, setVin] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <FormError error={error} />
      <div className="flex flex-wrap gap-2">
        {hasVin ? (
          <button
            type="button"
            className="btn btn-sm"
            onClick={async () => {
              const r = await run(() => guard(() => api<{ vin: string | null }>(`/vehicles/${vehicleId}/vin`, { method: "POST" })) as Promise<{ vin: string | null } | undefined>);
              if (r && typeof r === "object" && "vin" in r) setVin((r as { vin: string | null }).vin);
            }}
          >
            {t.garage.vin}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-sm text-danger"
          disabled={pending}
          onClick={async () => {
            if (!confirm(t.garage.deleteConfirm)) return;
            if (await run(() => api(`/vehicles/${vehicleId}`, { method: "DELETE" }))) {
              router.push("/garage");
              router.refresh();
            }
          }}
        >
          {t.common.delete}
        </button>
      </div>
      {vin ? <p className="text-sm"><Ltr className="select-all text-base">{vin}</Ltr></p> : null}
      {dialog}
    </div>
  );
}
