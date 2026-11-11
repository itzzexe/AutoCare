"use client";

import { useCallback, useEffect, useState } from "react";
import { ROLES } from "@autocare/contracts";
import { FormError, Input, Select, useSubmit } from "@/components/form";
import { errorText, useT } from "@/components/i18n";
import { useReauth } from "@/components/reauth";
import { Ltr, Stamp } from "@/components/ui/bits";
import { ApiError, api } from "@/lib/api-client";

function useLoad<T>(path: string) {
  const { t } = useT();
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => {
    api<T>(path).then(setData).catch((e) => setErr(e instanceof ApiError ? errorText(t, e.code, e.message) : t.errors.generic));
  }, [path, t]);
  useEffect(reload, [reload]);
  return { data, err, reload };
}

const Loading = () => <div className="space-y-2"><div className="skeleton h-5 w-1/2" /><div className="skeleton h-5 w-2/3" /></div>;

// ---------------- users & roles ----------------
export function UsersPanel({ mfaEnabled }: { mfaEnabled: boolean }) {
  const { t, locale } = useT();
  const ar = locale === "ar";
  const [q, setQ] = useState("");
  const { data, err, reload } = useLoad<{ items: Array<{ id: string; email: string; displayName: string; status: string; roles: string[]; mfaEnabledAt: string | null; emailVerifiedAt: string | null }> }>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  const { guard, dialog } = useReauth(mfaEnabled);
  const s = useSubmit<unknown>();
  return (
    <div className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQ(String(new FormData(e.currentTarget).get("q") ?? "")); }}>
        <input name="q" className="field" placeholder="email" dir="ltr" maxLength={120} />
        <button className="btn">{t.home.submit}</button>
      </form>
      <FormError error={err ?? s.error} />
      {!data ? <Loading /> : (
        <ul className="ticket divide-y divide-dashed divide-rule">
          {data.items.map((u) => (
            <li key={u.id} className="grid gap-2 p-4 md:grid-cols-[1fr_auto]">
              <div className="text-sm">
                <p className="font-semibold">{u.displayName} <Ltr className="text-xs text-ink-3">{u.email}</Ltr></p>
                <div className="mt-1 flex flex-wrap gap-1">{u.roles.map((r) => <Stamp key={r} tone="info">{r}</Stamp>)}{u.mfaEnabledAt ? <Stamp tone="ok">MFA</Stamp> : null}{!u.emailVerifiedAt ? <Stamp tone="warn">unverified</Stamp> : null}</div>
              </div>
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const body = { userId: u.id, role: String(fd.get("role")), action: String(fd.get("action")), reason: String(fd.get("reason")) };
                  const ok = await s.run(() => guard(() => api("/admin/roles", { body })) as Promise<unknown>);
                  if (ok) reload();
                }}
              >
                <select name="role" className="field w-auto text-sm">{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                <select name="action" className="field w-auto text-sm"><option value="grant">grant</option><option value="revoke">revoke</option></select>
                <input name="reason" required minLength={3} maxLength={300} className="field w-40 text-sm" placeholder={ar ? "السبب" : "reason"} />
                <button className="btn btn-sm" disabled={s.pending}>{t.common.save}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-3">{ar ? "تغيير الأدوار يتطلب إعادة المصادقة، يُسجَّل في التدقيق، وينهي جلسات المستخدم المعني." : "Role changes need re-authentication, are audited, and end the target user's sessions."}</p>
      {dialog}
    </div>
  );
}

// ---------------- moderation ----------------
export function ModerationPanel() {
  const { t, locale } = useT();
  const ar = locale === "ar";
  const merchants = useLoad<{ items: Array<{ id: string; name: string; governorate: string; city: string; status: string; createdAt: string }> }>("/moderation/merchants");
  const workshops = useLoad<{ items: Array<{ id: string; name: string; governorate: string; city: string; status: string; specialties: string[] }> }>("/moderation/workshops");
  const reviews = useLoad<{ items: Array<{ id: string; rating: number; body: string; flagCount: number; targetKind: string }> }>("/moderation/reviews");
  const s = useSubmit<unknown>();
  const act = async (fn: () => Promise<unknown>, reload: () => void) => {
    if (await s.run(fn)) reload();
  };
  const Row = ({ kind, x, reload }: { kind: "merchants" | "workshops"; x: { id: string; name: string; governorate: string; city: string; status: string }; reload: () => void }) => (
    <li className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
      <span><strong>{x.name}</strong> · {x.governorate} · {x.city} <Stamp tone={x.status === "approved" ? "ok" : x.status === "pending" ? "warn" : "neutral"}>{x.status}</Stamp></span>
      <span className="flex gap-1">
        {(["approved", "suspended", "rejected"] as const).filter((st) => st !== x.status).map((st) => (
          <button key={st} type="button" className="btn btn-sm" disabled={s.pending} onClick={() => act(() => api(`/moderation/${kind}/${x.id}`, { method: "PATCH", body: { status: st } }), reload)}>{st}</button>
        ))}
      </span>
    </li>
  );
  return (
    <div className="space-y-6">
      <FormError error={s.error ?? merchants.err ?? workshops.err} />
      <section className="ticket">
        <div className="ticket-head"><span>{ar ? "التجار" : "Merchants"}</span><span /></div>
        {!merchants.data ? <div className="p-4"><Loading /></div> : <ul className="divide-y divide-dashed divide-rule">{merchants.data.items.map((m) => <Row key={m.id} kind="merchants" x={m} reload={merchants.reload} />)}</ul>}
      </section>
      <section className="ticket">
        <div className="ticket-head"><span>{ar ? "الورش" : "Workshops"}</span><span /></div>
        {!workshops.data ? <div className="p-4"><Loading /></div> : <ul className="divide-y divide-dashed divide-rule">{workshops.data.items.map((w) => <Row key={w.id} kind="workshops" x={w} reload={workshops.reload} />)}</ul>}
      </section>
      <section className="ticket">
        <div className="ticket-head"><span>{ar ? "مراجعات مُبلّغ عنها" : "Flagged reviews"}</span><span /></div>
        {!reviews.data ? <div className="p-4"><Loading /></div> : reviews.data.items.length === 0 ? <p className="p-4 text-sm text-ink-3">{t.common.empty}</p> : (
          <ul className="divide-y divide-dashed divide-rule">
            {reviews.data.items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <span><Ltr>{"★".repeat(r.rating)}</Ltr> “{r.body}” · flags {r.flagCount}</span>
                <span className="flex gap-1">
                  <button type="button" className="btn btn-sm" onClick={() => act(() => api(`/moderation/reviews/${r.id}`, { method: "PATCH", body: { status: "published" } }), reviews.reload)}>publish</button>
                  <button type="button" className="btn btn-sm text-danger" onClick={() => act(() => api(`/moderation/reviews/${r.id}`, { method: "PATCH", body: { status: "hidden" } }), reviews.reload)}>hide</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <VerifyProduct />
    </div>
  );
}

function VerifyProduct() {
  const { locale } = useT();
  const s = useSubmit<unknown>();
  const [done, setDone] = useState(false);
  return (
    <form className="ticket flex flex-wrap items-end gap-2 p-4" onSubmit={async (e) => { e.preventDefault(); const id = String(new FormData(e.currentTarget).get("pid")); if (await s.run(() => api(`/moderation/products/${id}/verify`, { method: "POST" }))) setDone(true); }}>
      <div className="flex-1"><Input label={locale === "ar" ? "تأكيد أصالة قطعة (معرّف المنتج) بعد مراجعة الإثبات" : "Verify part authenticity (product id) after reviewing evidence"} name="pid" required pattern="[0-9a-f-]{36}" ltr /></div>
      <button className="btn btn-sm">{done ? "✓" : "verify"}</button>
      <FormError error={s.error} />
    </form>
  );
}

// ---------------- providers, licences, coverage ----------------
interface ProvStatus { id: string; name: string; state: string; reason: string; docsUrl: string; docsNote: string; circuit: string; policy: null | { version: string; allowDisplay: boolean; allowCache: boolean; allowEmbeddings: boolean; allowTraining: boolean; validUntil: string | null; agreementRef: string | null } }
interface Coverage { id: string; providerId: string; make: string; model: string | null; system: string; status: string; evidenceNote: string | null }

export function ProvidersPanel({ mfaEnabled }: { mfaEnabled: boolean }) {
  const { t, locale } = useT();
  const ar = locale === "ar";
  const { data, err, reload } = useLoad<{ providers: ProvStatus[]; coverage: Coverage[] }>("/admin/providers");
  const { guard, dialog } = useReauth(mfaEnabled);
  const s = useSubmit<unknown>();
  const [brand, setBrand] = useState("");
  if (!data) return err ? <FormError error={err} /> : <Loading />;
  const makes = [...new Set(data.coverage.map((c) => c.make))];
  const systems = ["vin_decode", "dtc_generic", "dtc_manufacturer", "repair_procedures", "fitment"];
  return (
    <div className="space-y-6">
      <FormError error={s.error} />
      <ul className="grid gap-4 md:grid-cols-2">
        {data.providers.filter((p) => p.id !== "mock_test").map((p) => (
          <li key={p.id} className="ticket p-4 text-sm">
            <div className="flex items-center justify-between gap-2"><strong>{p.name}</strong><Stamp tone={p.state === "active" ? "ok" : "neutral"}>{p.state}</Stamp></div>
            <p className="mt-1 text-xs text-ink-3">{p.docsNote}</p>
            <p className="mt-1 text-xs" dir="ltr">{p.reason} · circuit {p.circuit}</p>
            {p.policy ? <p className="mt-1 text-xs" dir="ltr">licence {p.policy.version}: display={String(p.policy.allowDisplay)} cache={String(p.policy.allowCache)} embeddings={String(p.policy.allowEmbeddings)} training={String(p.policy.allowTraining)}</p> : <p className="mt-1 text-xs text-warn">{ar ? "لا توجد سياسة ترخيص مسجلة — الاستخدام ممنوع." : "No licence policy recorded — use blocked."}</p>}
          </li>
        ))}
      </ul>

      <form
        className="ticket grid gap-3 p-5 sm:grid-cols-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const b = (k: string) => fd.get(k) === "on";
          const body = {
            providerId: String(fd.get("providerId")), version: String(fd.get("version")), allowDisplay: b("display"), allowCache: b("cache"), cacheTtlSeconds: Number(fd.get("ttl") || 0),
            allowTranslation: b("translation"), allowOffline: b("offline"), allowEmbeddings: b("embeddings"), allowTraining: b("training"), allowRedistribution: b("redistribution"),
            validFrom: new Date(String(fd.get("from"))).toISOString(), validUntil: fd.get("until") ? new Date(String(fd.get("until"))).toISOString() : undefined, agreementRef: String(fd.get("ref")), notes: String(fd.get("notes") ?? "") || undefined,
          };
          if (await s.run(() => guard(() => api("/admin/licenses", { body })) as Promise<unknown>)) reload();
        }}
      >
        <p className="text-lg font-bold sm:col-span-3">{ar ? "تسجيل سياسة ترخيص (من العقد فقط)" : "Record licence policy (from the signed agreement only)"}</p>
        <Select label="provider" name="providerId">{data.providers.filter((p) => p.id !== "mock_test").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Input label={t.common.version} name="version" required maxLength={40} ltr />
        <Input label="agreement ref" name="ref" required maxLength={300} ltr />
        <Input label="valid from" name="from" type="date" required ltr />
        <Input label="valid until" name="until" type="date" ltr />
        <Input label="cache TTL (s)" name="ttl" type="number" min={0} ltr />
        <div className="flex flex-wrap gap-3 text-sm sm:col-span-3">
          {["display", "cache", "translation", "offline", "embeddings", "training", "redistribution"].map((k) => <label key={k} className="flex items-center gap-1"><input type="checkbox" name={k} className="accent-[var(--signal)]" />{k}</label>)}
        </div>
        <div className="sm:col-span-3"><button className="btn btn-primary btn-sm" disabled={s.pending}>{t.common.save}</button></div>
      </form>

      <section className="ticket overflow-x-auto">
        <div className="ticket-head"><span>Coverage matrix</span><input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="filter make" className="field h-8 min-h-0 w-36 py-0 text-xs" dir="ltr" /></div>
        <table className="w-full min-w-[640px] text-xs">
          <thead><tr className="border-b border-ink"><th className="p-2 text-start">make</th>{systems.map((s2) => <th key={s2} className="p-2 text-start" dir="ltr">{s2}</th>)}</tr></thead>
          <tbody>
            {makes.filter((m) => m.toLowerCase().includes(brand.toLowerCase())).map((m) => (
              <tr key={m} className="border-b border-dashed border-rule">
                <td className="p-2 font-semibold">{m}</td>
                {systems.map((sys) => {
                  const rows = data.coverage.filter((c) => c.make === m && c.system === sys);
                  return <td key={sys} className="p-2">{rows.map((r) => <span key={r.id} title={r.evidenceNote ?? ""} className="me-1 inline-block"><Stamp tone={r.status === "verified_sample" ? "ok" : r.status === "not_covered" ? "danger" : r.status === "claimed_by_provider" ? "info" : "neutral"}>{r.providerId}:{r.status}</Stamp></span>)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="p-3 text-xs text-ink-3">{ar ? "لا تُعتبر أي علامة «مغطاة» دون دليل فحص عيّنة. pnpm coverage:sample يسجل نتائج عيّنات حقيقية فقط." : "No brand is 'covered' without sample-check evidence. pnpm coverage:sample records real sample results only."}</p>
      </section>
      {dialog}
    </div>
  );
}

// ---------------- datasets & models ----------------
export function LearningPanel({ mfaEnabled }: { mfaEnabled: boolean }) {
  const { t, locale } = useT();
  const ar = locale === "ar";
  const ds = useLoad<{ items: Array<{ id: string; name: string; status: string; caseCount: number; createdAt: string; manifest: { train: string[]; test: string[] } }> }>("/admin/datasets");
  const models = useLoad<{ items: Array<{ id: string; name: string; baseModel: string; license: string; status: string }>; evaluations: Array<{ id: string; modelName: string; evalSet: string; groundTruth: string; metrics: Record<string, unknown>; createdAt: string }> }>("/admin/models");
  const { guard, dialog } = useReauth(mfaEnabled);
  const s = useSubmit<unknown>();
  const act = async (fn: () => Promise<unknown>, reload: () => void) => {
    if (await s.run(() => guard(fn) as Promise<unknown>)) reload();
  };
  return (
    <div className="space-y-6">
      <FormError error={s.error ?? ds.err ?? models.err} />
      <section className="ticket">
        <div className="ticket-head"><span>{ar ? "إصدارات البيانات" : "Dataset versions"}</span><span /></div>
        <div className="p-4">
          <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); const name = String(new FormData(e.currentTarget).get("name")); act(() => api("/admin/datasets", { body: { name } }), ds.reload); }}>
            <input name="name" required minLength={3} maxLength={80} className="field" placeholder="ds-2026-10" dir="ltr" />
            <button className="btn btn-sm">{ar ? "ابنِ من الحالات المؤهلة" : "Build from eligible cases"}</button>
          </form>
          <ul className="divide-y divide-dashed divide-rule text-sm">
            {ds.data?.items.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><Ltr>{d.name}</Ltr> · {d.caseCount} · train {d.manifest.train.length} / test {d.manifest.test.length} <Stamp tone={d.status === "approved" ? "ok" : "neutral"}>{d.status}</Stamp></span>
                <span className="flex gap-1">
                  {d.status === "draft" ? <button type="button" className="btn btn-sm" onClick={() => act(() => api(`/admin/datasets/${d.id}/approve`, { method: "POST" }), ds.reload)}>approve</button> : null}
                  {d.status !== "draft" ? <a className="btn btn-sm" href={`/api/v1/admin/datasets/${d.id}/export`}>JSONL</a> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="ticket">
        <div className="ticket-head"><span>Model registry</span><span /></div>
        <div className="space-y-3 p-4">
          <form className="grid gap-2 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); act(() => api("/admin/models", { body: { name: String(fd.get("name")), baseModel: String(fd.get("base")), license: String(fd.get("license")) } }), models.reload); }}>
            <input name="name" required className="field" placeholder="qwen3:8b" dir="ltr" />
            <input name="base" required className="field" placeholder="qwen3:8b" dir="ltr" />
            <input name="license" required className="field" placeholder="Apache-2.0" dir="ltr" />
            <button className="btn btn-sm">register</button>
          </form>
          <ul className="divide-y divide-dashed divide-rule text-sm">
            {models.data?.items.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><Ltr>{m.name}</Ltr> · {m.license} <Stamp tone={m.status === "active" ? "ok" : "neutral"}>{m.status}</Stamp></span>
                <span className="flex gap-1">{(["approved", "active", "retired"] as const).filter((x) => x !== m.status).map((x) => <button key={x} type="button" className="btn btn-sm" onClick={() => act(() => api(`/admin/models/${m.id}`, { method: "PATCH", body: { status: x } }), models.reload)}>{x}</button>)}</span>
              </li>
            ))}
          </ul>
          <p className="label-mono pt-2">evaluation runs</p>
          <ul className="text-xs" dir="ltr">
            {models.data?.evaluations.map((e) => <li key={e.id}>{e.modelName} · {e.evalSet} · {e.groundTruth} · {JSON.stringify(e.metrics).slice(0, 160)}</li>)}
            {!models.data?.evaluations.length ? <li className="text-ink-3">{t.common.empty}</li> : null}
          </ul>
        </div>
      </section>
      {dialog}
    </div>
  );
}

// ---------------- audit & outbox ----------------
export function AuditPanel() {
  const { locale } = useT();
  const [action, setAction] = useState("");
  const { data, err } = useLoad<{ items: Array<{ id: string; at: string; action: string; actorUserId: string | null; targetKind: string | null; targetId: string | null; ipPrefix: string | null; meta: Record<string, unknown> }> }>(`/admin/audit${action ? `?action=${encodeURIComponent(action)}` : ""}`);
  return (
    <div className="space-y-3">
      <input className="field" dir="ltr" placeholder="action e.g. rbac.role_granted" value={action} onChange={(e) => setAction(e.target.value.trim())} />
      <FormError error={err} />
      {!data ? <Loading /> : (
        <div className="ticket overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs" dir="ltr">
            <thead><tr className="border-b border-ink"><th className="p-2 text-left">at</th><th className="text-left">action</th><th className="text-left">actor</th><th className="text-left">target</th><th className="text-left">ip</th><th className="text-left">meta</th></tr></thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id} className="border-b border-dashed border-rule">
                  <td className="p-2">{new Date(e.at).toLocaleString(locale === "ar" ? "ar-IQ" : "en-GB")}</td><td>{e.action}</td><td>{e.actorUserId?.slice(0, 8) ?? "—"}</td><td>{e.targetKind}:{e.targetId?.slice(0, 8)}</td><td>{e.ipPrefix ?? "—"}</td><td className="max-w-xs truncate">{JSON.stringify(e.meta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function OutboxPanel() {
  const { data, err } = useLoad<{ items: Array<{ id: string; template: string; status: string; createdAt: string; payload: Record<string, string> }> }>("/admin/outbox");
  return (
    <div className="space-y-3">
      <FormError error={err} />
      {!data ? <Loading /> : (
        <ul className="ticket divide-y divide-dashed divide-rule text-sm">
          {data.items.map((m) => (
            <li key={m.id} className="p-3">
              <p><Ltr>{m.template}</Ltr> <Stamp tone="warn">{m.status}</Stamp></p>
              {m.payload.link ? <a className="link break-all text-xs" href={m.payload.link} dir="ltr">{m.payload.link}</a> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
