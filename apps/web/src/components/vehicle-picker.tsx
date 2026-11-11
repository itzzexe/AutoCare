"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "./i18n";

/** Changes ?vehicleId= so server-rendered interpretations match the chosen vehicle. */
export function VehiclePicker({ vehicles, value }: { vehicles: Array<{ id: string; label: string }>; value?: string }) {
  const { t } = useT();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  if (!vehicles.length) return null;
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-ink-2">{t.search.pickVehicle}</span>
      <select
        className="field w-auto min-w-56"
        value={value ?? ""}
        onChange={(e) => {
          const p = new URLSearchParams(sp.toString());
          if (e.target.value) p.set("vehicleId", e.target.value);
          else p.delete("vehicleId");
          router.replace(`${path}?${p.toString()}`);
        }}
      >
        <option value="">{t.search.noVehicle}</option>
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>{v.label}</option>
        ))}
      </select>
    </label>
  );
}
