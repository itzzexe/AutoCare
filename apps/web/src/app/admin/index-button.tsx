"use client";

import { useState } from "react";
import { FormError, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { api } from "@/lib/api-client";

/** Explicit action: embed pending RAG chunks with the local embedding model. */
export function IndexButton() {
  const { locale } = useT();
  const { pending, error, run } = useSubmit<{ embedded: number }>();
  const [n, setN] = useState<number | null>(null);
  return (
    <div className="space-y-1">
      <button type="button" className="btn btn-sm" disabled={pending} onClick={async () => { const r = await run(() => api<{ embedded: number }>("/admin/ai/index", { method: "POST" })); if (r) setN(r.embedded); }}>
        {pending ? "…" : locale === "ar" ? "فهرسة المتجهات (Embeddings)" : "Index embeddings"}
      </button>
      {n !== null ? <p className="text-xs text-ok" dir="ltr">embedded {n} chunks</p> : null}
      <FormError error={error} />
    </div>
  );
}
