"use client";

import { FormError, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { api } from "@/lib/api-client";

/** Restarts the hosted payment for an unpaid online order. Follows only HTTPS gateway URLs. */
export function PayButton({ orderId }: { orderId: string }) {
  const { t } = useT();
  const { pending, error, run } = useSubmit<{ redirectUrl: string }>();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={pending}
        onClick={async () => {
          const r = await run(() => api(`/orders/${orderId}/pay`, { method: "POST", body: {} }));
          if (r?.redirectUrl?.startsWith("https://")) window.location.assign(r.redirectUrl);
        }}
      >
        {pending ? t.common.loading : t.market.payNow}
      </button>
      <FormError error={error} />
    </div>
  );
}
