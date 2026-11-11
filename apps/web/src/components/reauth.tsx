"use client";

import { useRef, useState } from "react";
import { ApiError, api } from "@/lib/api-client";
import { FormError, Input, useSubmit } from "./form";
import { useT } from "./i18n";

/**
 * Wrap a sensitive call: if the server answers reauth_required, ask for the
 * password (and TOTP when enabled), call /auth/reauth, then retry once.
 */
export function useReauth(mfaEnabled = false) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const pendingRetry = useRef<(() => void) | null>(null);
  const { pending, error, run } = useSubmit<unknown>();

  async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ApiError && e.code === "reauth_required") {
        return new Promise<T | undefined>((resolve) => {
          pendingRetry.current = () => fn().then(resolve, () => resolve(undefined));
          setOpen(true);
        });
      }
      throw e;
    }
  }

  const dialog = open ? (
    <div role="dialog" aria-modal="true" aria-labelledby="reauth-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        className="ticket w-full max-w-sm space-y-4 p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const ok = await run(() => api("/auth/reauth", { body: { password: String(fd.get("password")), ...(mfaEnabled ? { totp: String(fd.get("totp")) } : {}) } }));
          if (ok) {
            setOpen(false);
            pendingRetry.current?.();
          }
        }}
      >
        <h2 id="reauth-title" className="text-xl font-bold">{t.auth.reauthTitle}</h2>
        <p className="text-sm text-ink-2">{t.auth.reauthBody}</p>
        <FormError error={error} />
        <Input label={t.auth.password} name="password" type="password" required autoFocus ltr autoComplete="current-password" />
        {mfaEnabled ? <Input label={t.auth.totp} name="totp" inputMode="numeric" pattern="\d{6}" maxLength={6} required ltr /> : null}
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={pending}>{t.common.continue}</button>
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>{t.common.cancel}</button>
        </div>
      </form>
    </div>
  ) : null;

  return { guard, dialog };
}
