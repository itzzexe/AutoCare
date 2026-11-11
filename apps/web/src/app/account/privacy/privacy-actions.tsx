"use client";

import { useRouter } from "next/navigation";
import { FormError, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { useReauth } from "@/components/reauth";
import { ApiError, api } from "@/lib/api-client";

export function PrivacyActions({ mfaEnabled }: { mfaEnabled: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const { guard, dialog } = useReauth(mfaEnabled);
  const s = useSubmit<unknown>();

  async function download() {
    // Export is sensitive: reauth first, then fetch as a file download.
    await s.run(() =>
      guard(async () => {
        const res = await fetch("/api/v1/account/export", { credentials: "same-origin", cache: "no-store" });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } };
          throw new ApiError(j.error?.code ?? "internal", res.status, j.error?.message ?? "error");
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "autocare-my-data.json";
        a.click();
        URL.revokeObjectURL(url);
        return true;
      }) as Promise<unknown>,
    );
  }

  return (
    <section className="ticket space-y-4 p-5">
      <FormError error={s.error} />
      <div>
        <button type="button" className="btn" disabled={s.pending} onClick={download}>{t.account.export}</button>
      </div>
      <div className="border-t border-dashed border-rule pt-4">
        <p className="mb-2 text-sm text-ink-2">{t.account.deleteWarn}</p>
        <button
          type="button"
          className="btn text-danger"
          disabled={s.pending}
          onClick={async () => {
            if (!confirm(t.account.deleteWarn)) return;
            const ok = await s.run(() => guard(() => api("/account", { method: "DELETE" })) as Promise<unknown>);
            if (ok) {
              router.push("/");
              router.refresh();
            }
          }}
        >
          {t.account.deleteAccount}
        </button>
      </div>
      {dialog}
    </section>
  );
}
