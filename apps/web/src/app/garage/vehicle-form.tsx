"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FUELS, TRANSMISSIONS, VEHICLE_SALES_MARKETS, isWellFormedVin, normalizeVin } from "@autocare/contracts";
import { FormError, Input, Select, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { Notice, Stamp } from "@/components/ui/bits";
import { api } from "@/lib/api-client";

interface Decode {
  provider: string;
  providerState: string;
  checkDigitValid: boolean;
  result: null | { make: string | null; model: string | null; modelYear: number | null; engine: string | null; fuel: string | null; transmission: string | null; trim: string | null; warnings: string[] };
}

const MAKES = ["Toyota", "Nissan", "Honda", "Hyundai", "Kia", "Ford", "Chevrolet", "GMC", "Mitsubishi", "Mazda", "Lexus", "BMW", "Mercedes-Benz", "Volkswagen", "Audi", "Peugeot", "Renault", "BYD", "Geely", "Chery", "Changan", "MG", "Haval", "JAC", "Great Wall"];

export function VehicleForm() {
  const { t } = useT();
  const router = useRouter();
  const { pending, error, fields, run } = useSubmit<unknown>();
  const decode = useSubmit<Decode>();
  const [vin, setVin] = useState("");
  const [suggestion, setSuggestion] = useState<Decode | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [vals, setVals] = useState({ make: "", model: "", year: "", engine: "" });

  const [models, setModels] = useState<string[]>([]);
  // Optional model suggestions (NHTSA vPIC). Silent when the provider is off or down.
  useEffect(() => {
    const year = Number(vals.year);
    if (vals.make.trim().length < 2 || !Number.isInteger(year) || year < 1996 || year > new Date().getFullYear() + 1) {
      setModels([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      api<{ status: string; models: string[] }>(`/catalog/models?${new URLSearchParams({ make: vals.make.trim(), year: String(year) })}`, { signal: ctrl.signal })
        .then((r) => setModels(r.status === "ok" ? r.models : []))
        .catch(() => setModels([]));
    }, 400);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [vals.make, vals.year]);

  const nv = normalizeVin(vin);
  const vinOk = nv.length === 0 || isWellFormedVin(nv);

  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const odometer = String(fd.get("odometer") ?? "").trim();
        const r = await run(() =>
          api<{ id: string }>("/vehicles", {
            body: {
              nickname: String(fd.get("nickname") ?? "") || undefined,
              make: vals.make,
              model: vals.model,
              year: Number(vals.year),
              engine: vals.engine || undefined,
              fuel: String(fd.get("fuel")),
              transmission: String(fd.get("transmission")),
              salesMarket: String(fd.get("salesMarket")),
              odometer: odometer ? Number(odometer) : undefined,
              odometerUnit: String(fd.get("odometerUnit")),
              vin: nv || undefined,
              vinDataConfirmed: Boolean(nv && confirmed),
            },
          }),
        );
        if (r) {
          const id = (r as { id: string }).id;
          // The server re-decodes and stores the decode itself; browser-supplied decode data is never trusted.
          if (nv && confirmed) await api(`/vehicles/${id}/confirm-decode`, { body: { vin: nv } }).catch(() => undefined);
          router.push(`/garage/${id}`);
          router.refresh();
        }
      }}
    >
      <FormError error={error} />

      <fieldset className="ticket p-5">
        <legend className="label-mono px-1">VIN</legend>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <Input label={t.garage.vin} name="vin" value={vin} onChange={(e) => { setVin(e.target.value); setSuggestion(null); setConfirmed(false); }} maxLength={20} ltr hint={t.garage.vinHint} fields={fields} autoComplete="off" spellCheck={false} />
          <button
            type="button"
            className="btn"
            disabled={!nv || !vinOk || decode.pending}
            onClick={async () => {
              const r = await decode.run(() => api<Decode>("/vehicles/decode-vin", { body: { vin: nv, modelYear: vals.year ? Number(vals.year) : undefined } }));
              if (r) setSuggestion(r);
            }}
          >
            {decode.pending ? t.common.loading : t.garage.vinDecode}
          </button>
        </div>
        {!vinOk ? <p className="field-error">VIN: 17 · A-Z 0-9 (I, O, Q)</p> : null}
        <p className="field-hint mt-2">{t.garage.vinDecodeNote}</p>
        <FormError error={decode.error} />
        {suggestion ? (
          <div className="mt-4 space-y-3 border border-dashed border-rule p-4">
            {!suggestion.checkDigitValid ? <Notice tone="warn">{t.garage.checkDigitBad}</Notice> : null}
            {suggestion.result ? (
              <>
                <p className="label-mono">{t.garage.vinSuggestion} · <span dir="ltr">{suggestion.provider}</span></p>
                <dl className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-4">
                  <dt className="text-ink-3">{t.garage.make}</dt><dd>{suggestion.result.make ?? "—"}</dd>
                  <dt className="text-ink-3">{t.garage.model}</dt><dd>{suggestion.result.model ?? "—"}</dd>
                  <dt className="text-ink-3">{t.garage.year}</dt><dd dir="ltr" className="text-start">{suggestion.result.modelYear ?? "—"}</dd>
                  <dt className="text-ink-3">{t.garage.engine}</dt><dd dir="ltr" className="text-start">{suggestion.result.engine ?? "—"}</dd>
                </dl>
                {suggestion.result.warnings.length ? <p className="text-xs text-warn" dir="ltr">{suggestion.result.warnings.join(" · ")}</p> : null}
                <p className="text-xs text-ink-3">{t.garage.vinNotProof}</p>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    const r = suggestion.result!;
                    setVals({ make: r.make ? r.make[0] + r.make.slice(1).toLowerCase() : vals.make, model: r.model ?? vals.model, year: r.modelYear ? String(r.modelYear) : vals.year, engine: r.engine ?? vals.engine });
                    setConfirmed(true);
                  }}
                >
                  {t.garage.vinConfirm}
                </button>
                {confirmed ? <Stamp tone="ok" className="ms-2 stamp-in">{t.common.yes}</Stamp> : null}
              </>
            ) : (
              <Notice tone="warn">{t.errors.provider_not_configured} ({suggestion.providerState})</Notice>
            )}
          </div>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="f-make" className="field-label">{t.garage.make}</label>
          <input id="f-make" className="field" list="makes" required maxLength={60} value={vals.make} onChange={(e) => setVals({ ...vals, make: e.target.value })} aria-invalid={fields.make ? true : undefined} />
          <datalist id="makes">{MAKES.map((m) => <option key={m} value={m} />)}</datalist>
        </div>
        <div>
          <Input label={t.garage.model} name="model" required maxLength={80} list="models" value={vals.model} onChange={(e) => setVals({ ...vals, model: e.target.value })} fields={fields} />
          <datalist id="models">{models.map((m) => <option key={m} value={m} />)}</datalist>
          {models.length ? <p className="field-hint">{t.garage.modelsFrom}</p> : null}
        </div>
        <Input label={t.garage.year} name="year" type="number" required min={1950} max={new Date().getFullYear() + 1} value={vals.year} onChange={(e) => setVals({ ...vals, year: e.target.value })} ltr fields={fields} />
        <Input label={t.garage.engine} name="engine" maxLength={80} placeholder={t.garage.enginePh} value={vals.engine} onChange={(e) => setVals({ ...vals, engine: e.target.value })} ltr fields={fields} />
        <Select label={t.garage.fuel} name="fuel" defaultValue="petrol" fields={fields}>
          {FUELS.map((f) => <option key={f} value={f}>{t.garage.fuels[f]}</option>)}
        </Select>
        <Select label={t.garage.transmission} name="transmission" defaultValue="automatic" fields={fields}>
          {TRANSMISSIONS.map((x) => <option key={x} value={x}>{t.garage.transmissions[x]}</option>)}
        </Select>
        <Select label={t.garage.market} name="salesMarket" defaultValue="GCC" fields={fields}>
          {VEHICLE_SALES_MARKETS.map((m) => <option key={m} value={m}>{t.garage.markets[m]}</option>)}
        </Select>
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <Input label={t.garage.odometer} name="odometer" type="number" min={0} max={5000000} ltr fields={fields} />
          <Select label={t.garage.unit} name="odometerUnit" defaultValue="km">
            <option value="km">km</option>
            <option value="mi">mi</option>
          </Select>
        </div>
        <Input label={t.garage.nickname} name="nickname" maxLength={60} placeholder={t.garage.nicknamePh} fields={fields} />
      </div>

      <button className="btn btn-primary" disabled={pending || !vinOk}>{pending ? t.common.loading : t.common.save}</button>
    </form>
  );
}
