"use client";

import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ApiError } from "@/lib/api-client";
import { errorText, useT } from "./i18n";

export function useSubmit<T>() {
  const { t } = useT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  async function run(fn: () => Promise<T>): Promise<T | undefined> {
    setPending(true);
    setError(null);
    setFields({});
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(errorText(t, e.code, e.message));
        setFields(e.fields ?? {});
      } else setError(t.errors.generic);
      return undefined;
    } finally {
      setPending(false);
    }
  }
  return { pending, error, fields, run, setError };
}

export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="border-s-4 border-danger bg-danger-soft px-4 py-2.5 text-sm text-danger">
      {error}
    </div>
  );
}

type Base = { label: string; name: string; hint?: string; fields?: Record<string, string[]>; ltr?: boolean };

export function Input({ label, name, hint, fields, ltr, ...rest }: Base & InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useT();
  const err = fields?.[name];
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}{rest.required ? null : <span className="ms-1 font-normal text-ink-3">({t.common.optional})</span>}</label>
      <input id={id} name={name} className={`field ${ltr ? "ltr-id text-start" : ""}`} dir={ltr ? "ltr" : undefined} aria-invalid={err ? true : undefined} aria-describedby={hint ? `${id}-h` : undefined} {...rest} />
      {hint ? <p id={`${id}-h`} className="field-hint">{hint}</p> : null}
      {err ? <p className="field-error">{t.errors.validation_failed} ({err.join(", ")})</p> : null}
    </div>
  );
}

export function Textarea({ label, name, hint, fields, ...rest }: Base & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { t } = useT();
  const err = fields?.[name];
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}{rest.required ? null : <span className="ms-1 font-normal text-ink-3">({t.common.optional})</span>}</label>
      <textarea id={id} name={name} className="field" aria-invalid={err ? true : undefined} {...rest} />
      {hint ? <p className="field-hint">{hint}</p> : null}
      {err ? <p className="field-error">{t.errors.validation_failed}</p> : null}
    </div>
  );
}

export function Select({ label, name, hint, fields, children, ...rest }: Base & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const err = fields?.[name];
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <select id={id} name={name} className="field" aria-invalid={err ? true : undefined} {...rest}>
        {children}
      </select>
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}
