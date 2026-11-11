import { redirect } from "next/navigation";
import { Ltr, PageHeader, Stamp } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { env } from "@/server/config/env";
import { requireAuth } from "@/server/http/session";
import { platformCounts } from "@/server/modules/admin/service";
import { gateStats } from "@/server/modules/ai/gate";
import { listLocalModels, runtimeVersion } from "@/server/modules/ai/ollama";
import { allProviderStatuses } from "@/server/modules/providers/registry";
import { IndexButton } from "./index-button";

export default async function AdminHome() {
  const auth = await requireAuth("/admin");
  if (!auth.permissions.has("admin:audit")) redirect("/admin/moderation");
  const { locale } = await getDict();
  const ar = locale === "ar";
  const [counts, version, providers] = await Promise.all([platformCounts(), runtimeVersion(), allProviderStatuses()]);
  const models = version ? await listLocalModels().catch(() => []) : [];
  const g = gateStats();
  const e = env();
  return (
    <div className="space-y-6">
      <PageHeader title={ar ? "نظرة عامة" : "Overview"} />
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Object.entries(counts).map(([k, v]) => (
          <div key={k} className="ticket p-4">
            <p className="label-mono">{k}</p>
            <p className="font-display text-3xl font-bold" dir="ltr">{v}</p>
          </div>
        ))}
      </section>
      <section className="ticket">
        <div className="ticket-head"><span>{ar ? "الاستدلال المحلي" : "Local inference"}</span><span dir="ltr">{e.AI_MODE}</span></div>
        <div className="grid gap-4 p-5 text-sm sm:grid-cols-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-ink-3">runtime</dt><dd>{version ? <Ltr>Ollama {version}</Ltr> : <Stamp tone="danger">{ar ? "غير متصل" : "unreachable"}</Stamp>}</dd>
            <dt className="text-ink-3">model</dt><dd><Ltr>{e.AI_MODEL}</Ltr> {models.some((m) => m.name === e.AI_MODEL) ? <Stamp tone="ok">installed</Stamp> : <Stamp tone="warn">{ar ? "غير منزّل" : "not installed"}</Stamp>}</dd>
            <dt className="text-ink-3">embeddings</dt><dd><Ltr>{e.AI_EMBED_MODEL}</Ltr> {models.some((m) => m.name.startsWith(e.AI_EMBED_MODEL)) ? <Stamp tone="ok">installed</Stamp> : <Stamp tone="warn">{ar ? "غير منزّل" : "not installed"}</Stamp>}</dd>
            <dt className="text-ink-3">queue</dt><dd dir="ltr">{g.active}/{g.maxConcurrency} active · {g.queued}/{g.maxQueue} queued</dd>
            <dt className="text-ink-3">limits</dt><dd dir="ltr">ctx {e.AI_NUM_CTX} · out {e.AI_MAX_OUTPUT_TOKENS} · {e.AI_TIMEOUT_MS / 1000}s · {e.AI_DAILY_QUOTA_PER_USER}/user/day</dd>
          </dl>
          <div className="space-y-2">
            <p className="text-ink-2">{ar ? "الموديلات المثبتة محليًا (النماذج السحابية مستبعدة):" : "Locally installed models (cloud models excluded):"}</p>
            <ul className="text-xs" dir="ltr">{models.map((m) => <li key={m.name}>{m.name} · {(m.size / 1e9).toFixed(1)} GB · {m.details?.quantization_level}</li>)}</ul>
            <IndexButton />
          </div>
        </div>
      </section>
      <section className="ticket">
        <div className="ticket-head"><span>{ar ? "مزوّدو البيانات" : "Data providers"}</span><span /></div>
        <ul className="divide-y divide-dashed divide-rule text-sm">
          {providers.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <span className="font-semibold">{p.name}</span>
              <span className="flex items-center gap-2"><Ltr className="text-xs text-ink-3">{p.reason}</Ltr><Stamp tone={p.state === "active" ? "ok" : p.state === "test_only" ? "info" : "neutral"}>{p.state}</Stamp></span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
