"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormError, Input, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { api } from "@/lib/api-client";

export const TERMS_VERSION = "terms-2026.10-draft";

export function RegisterForm() {
  const { t, locale } = useT();
  const router = useRouter();
  const { pending, error, fields, run } = useSubmit<unknown>();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const ok = await run(() =>
          api("/auth/register", {
            body: {
              email: String(fd.get("email")),
              password: String(fd.get("password")),
              displayName: String(fd.get("displayName")),
              locale,
              acceptTerms: fd.get("acceptTerms") === "on",
              termsVersion: TERMS_VERSION,
            },
          }),
        );
        if (ok) router.push("/check-email");
      }}
    >
      <FormError error={error} />
      <Input label={t.auth.displayName} name="displayName" required maxLength={80} autoComplete="nickname" fields={fields} />
      <Input label={t.auth.email} name="email" type="email" required autoComplete="email" ltr fields={fields} />
      <Input label={t.auth.password} name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" ltr hint={t.auth.passwordHint} fields={fields} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acceptTerms" required className="mt-1 h-4 w-4 accent-[var(--signal)]" />
        <span>
          {t.auth.acceptTerms} — <Link className="link" href="/legal/terms" target="_blank">{t.footer.terms}</Link> · <Link className="link" href="/legal/privacy" target="_blank">{t.footer.privacy}</Link>
        </span>
      </label>
      <p className="text-xs text-ink-3">{t.consent.title}: {t.consent.inactive}. {t.consent.body.split(".")[0]}.</p>
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? t.common.loading : t.auth.registerTitle}</button>
      <p className="text-sm">{t.auth.haveAccount} <Link className="link" href="/login">{t.nav.login}</Link></p>
    </form>
  );
}
