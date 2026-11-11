"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FormError, Input, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { api } from "@/lib/api-client";

/** Only same-site relative paths are accepted as post-login redirects (no open redirect). */
function safeNext(v: string | null): string {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/garage";
}

export function LoginForm() {
  const { t } = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const { pending, error, fields, run } = useSubmit<unknown>();
  const [needTotp, setNeedTotp] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const body: Record<string, string> = { email: String(fd.get("email")), password: String(fd.get("password")) };
        if (needTotp) body.totp = String(fd.get("totp"));
        const r = await run(() => api<{ status: string }>("/auth/login", { body }));
        if (!r) return;
        if ((r as { status: string }).status === "mfa_required") {
          setNeedTotp(true);
          return;
        }
        router.push(safeNext(sp.get("next")));
        router.refresh();
      }}
    >
      <FormError error={error} />
      <Input label={t.auth.email} name="email" type="email" autoComplete="username" required ltr fields={fields} />
      <Input label={t.auth.password} name="password" type="password" autoComplete="current-password" required ltr fields={fields} />
      {needTotp ? <Input label={t.auth.totp} name="totp" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required autoFocus ltr hint={t.auth.totpHint} fields={fields} /> : null}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? t.common.loading : t.auth.loginTitle}</button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link className="link" href="/forgot-password">{t.auth.forgot}</Link>
        <span>{t.auth.noAccount} <Link className="link" href="/register">{t.nav.register}</Link></span>
      </div>
    </form>
  );
}
