"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormError, Input, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { api } from "@/lib/api-client";

export function VerifyEmail() {
  const { t } = useT();
  const token = useSearchParams().get("token") ?? "";
  const { error, run } = useSubmit<unknown>();
  const [done, setDone] = useState(false);
  const once = useRef(false);
  useEffect(() => {
    if (once.current || !token) return;
    once.current = true;
    // Verification is a POST (state change), triggered from the page — never a GET side effect.
    run(() => api("/auth/verify-email", { body: { token } })).then((r) => r && setDone(true));
  }, [token, run]);
  if (done) return <p className="stamp ok stamp-in text-base">{t.auth.verified}</p>;
  return error ? <FormError error={error} /> : <p className="text-ink-3">{t.common.loading}</p>;
}

export function ForgotForm() {
  const { t } = useT();
  const { pending, error, fields, run } = useSubmit<unknown>();
  const [sent, setSent] = useState(false);
  if (sent) return <p className="text-ink-2">{t.auth.checkEmailBody}</p>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const email = String(new FormData(e.currentTarget).get("email"));
        if (await run(() => api("/auth/password/forgot", { body: { email } }))) setSent(true);
      }}
    >
      <FormError error={error} />
      <Input label={t.auth.email} name="email" type="email" required ltr autoComplete="email" fields={fields} />
      <button className="btn btn-primary w-full" disabled={pending}>{t.auth.send}</button>
    </form>
  );
}

export function ResetForm() {
  const { t } = useT();
  const token = useSearchParams().get("token") ?? "";
  const { pending, error, fields, run } = useSubmit<unknown>();
  const [done, setDone] = useState(false);
  if (done)
    return (
      <div className="space-y-3">
        <p>{t.auth.resetDone}</p>
        <Link className="btn btn-primary" href="/login">{t.auth.loginTitle}</Link>
      </div>
    );
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const password = String(new FormData(e.currentTarget).get("password"));
        if (await run(() => api("/auth/password/reset", { body: { token, password } }))) setDone(true);
      }}
    >
      <FormError error={error} />
      <Input label={t.account.newPassword} name="password" type="password" required minLength={12} maxLength={128} ltr autoComplete="new-password" hint={t.auth.passwordHint} fields={fields} />
      <button className="btn btn-primary w-full" disabled={pending || !token}>{t.common.save}</button>
    </form>
  );
}
