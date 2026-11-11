"use client";

import { useT } from "@/components/i18n";

/** Generic error boundary: never shows stack traces or server messages. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-2xl px-4 pt-10">
      <div className="ticket space-y-3 p-8">
        <p className="font-display text-2xl font-bold">{t.errors.generic}</p>
        <button type="button" className="btn" onClick={reset}>{t.common.retry}</button>
      </div>
    </div>
  );
}
