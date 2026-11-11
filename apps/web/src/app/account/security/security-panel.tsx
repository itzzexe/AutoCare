"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FormError, Input, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { useReauth } from "@/components/reauth";
import { Ltr, Notice, Stamp } from "@/components/ui/bits";
import { api } from "@/lib/api-client";

interface Sess { handle: string; current: boolean; client: string; userAgent: string | null; ipPrefix: string | null; lastSeenAt: string; expiresAt: string }

export function SecurityPanel({ mfaEnabled, privileged }: { mfaEnabled: boolean; privileged: boolean }) {
  const { t, locale } = useT();
  const router = useRouter();
  const pw = useSubmit<unknown>();
  const mfa = useSubmit<{ otpauthUri: string; qrSvg: string }>();
  const sess = useSubmit<unknown>();
  const { guard, dialog } = useReauth(mfaEnabled);
  const [setup, setSetup] = useState<{ otpauthUri: string; qrSvg: string } | null>(null);
  const [sessions, setSessions] = useState<Sess[] | null>(null);
  const [pwDone, setPwDone] = useState(false);
  const load = () => api<{ items: Sess[] }>("/auth/sessions").then((r) => setSessions(r.items)).catch(() => setSessions([]));
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <section className="ticket p-5">
        <h2 className="mb-3 text-lg font-bold">{t.account.mfa}</h2>
        {privileged && !mfaEnabled ? <Notice tone="warn">{t.account.mfaRequiredRole}</Notice> : null}
        <FormError error={mfa.error} />
        {mfaEnabled ? (
          <div className="flex items-center gap-3">
            <Stamp tone="ok">{t.account.mfaOn}</Stamp>
            {!privileged ? <button type="button" className="btn btn-sm" onClick={async () => { if (await mfa.run(() => guard(() => api("/auth/mfa/disable", { method: "POST" })) as Promise<never>)) router.refresh(); }}>{t.account.mfaDisable}</button> : null}
          </div>
        ) : setup ? (
          <form
            className="grid gap-4 sm:grid-cols-[auto_1fr]"
            onSubmit={async (e) => {
              e.preventDefault();
              const totp = String(new FormData(e.currentTarget).get("totp"));
              if (await mfa.run(() => api("/auth/mfa/confirm", { body: { totp } }) as Promise<never>)) {
                setSetup(null);
                router.refresh();
              }
            }}
          >
            {/* QR rendered as an image (data URI) — no HTML injection path. */}
            <img src={`data:image/svg+xml;base64,${btoa(setup.qrSvg)}`} alt="TOTP QR" width={180} height={180} className="border border-rule bg-white p-2" />
            <div className="space-y-3">
              <p className="text-sm">{t.account.mfaScan}</p>
              <details className="text-xs"><summary className="cursor-pointer text-ink-3">otpauth://</summary><code className="ltr-id break-all">{setup.otpauthUri}</code></details>
              <Input label={t.auth.totp} name="totp" inputMode="numeric" pattern="\d{6}" maxLength={6} required ltr autoComplete="one-time-code" />
              <button className="btn btn-primary btn-sm" disabled={mfa.pending}>{t.common.save}</button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" disabled={mfa.pending} onClick={async () => { const r = await mfa.run(() => guard(() => api<{ otpauthUri: string; qrSvg: string }>("/auth/mfa/setup", { method: "POST" })) as Promise<{ otpauthUri: string; qrSvg: string }>); if (r && "qrSvg" in r) setSetup(r); }}>{t.account.mfaSetup}</button>
        )}
      </section>

      <section className="ticket p-5">
        <h2 className="mb-3 text-lg font-bold">{t.account.changePassword}</h2>
        {pwDone ? <p className="stamp ok">{t.common.save} ✓</p> : (
          <form
            className="grid max-w-md gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              if (await pw.run(() => api("/auth/password/change", { body: { currentPassword: String(fd.get("current")), newPassword: String(fd.get("next")) } }))) {
                setPwDone(true);
                load();
              }
            }}
          >
            <FormError error={pw.error} />
            <Input label={t.account.currentPassword} name="current" type="password" required ltr autoComplete="current-password" fields={pw.fields} />
            <Input label={t.account.newPassword} name="next" type="password" required minLength={12} maxLength={128} ltr autoComplete="new-password" hint={t.auth.passwordHint} fields={pw.fields} />
            <button className="btn btn-primary btn-sm justify-self-start" disabled={pw.pending}>{t.common.save}</button>
          </form>
        )}
      </section>

      <section className="ticket">
        <div className="ticket-head"><span>{t.account.sessions}</span><span /></div>
        <FormError error={sess.error} />
        <ul className="divide-y divide-dashed divide-rule text-sm">
          {sessions?.map((s) => (
            <li key={s.handle} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <div>
                <p className="font-medium">{s.userAgent?.slice(0, 80) ?? s.client} {s.current ? <Stamp tone="ok">{t.account.current}</Stamp> : null}</p>
                <p className="text-xs text-ink-3"><Ltr>{s.ipPrefix ?? "—"}</Ltr> · {new Date(s.lastSeenAt).toLocaleString(locale === "ar" ? "ar-IQ" : "en-GB", { timeZone: "Asia/Baghdad" })}</p>
              </div>
              <button type="button" className="btn btn-sm" onClick={async () => { const r = await sess.run(() => api<{ wasCurrent: boolean }>(`/auth/sessions/${s.handle}`, { method: "DELETE" })); if (r && (r as { wasCurrent: boolean }).wasCurrent) { router.push("/login"); router.refresh(); } else load(); }}>{t.account.revoke}</button>
            </li>
          ))}
        </ul>
      </section>
      {dialog}
    </div>
  );
}
