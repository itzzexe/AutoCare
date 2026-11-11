import { CodeTag, PageHeader, fmtDate } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requirePermission } from "@/server/http/session";
import { topDemand } from "@/server/modules/knowledge/importer";
import { ProvidersPanel } from "../panels";

export default async function Page() {
  const auth = await requirePermission("admin:providers", "/admin/providers");
  const { locale } = await getDict();
  const ar = locale === "ar";
  const demand = await topDemand(30);
  return (
    <div className="space-y-8">
      <PageHeader title={ar ? "المزوّدون والتغطية" : "Providers & coverage"} />
      <ProvidersPanel mfaEnabled={auth.user.mfaEnabled} />
      <section>
        <h2 className="label-mono mb-1">{ar ? "أكواد خاصة طلبها المستخدمون ولا نغطيها" : "Manufacturer codes users asked for that we can't answer"}</h2>
        <p className="mb-3 text-sm text-ink-3">
          {ar
            ? "عدّاد مجهول الهوية (بدون أي بيانات مستخدم). استخدمه لتحديد أي بيانات شركات تشتري ترخيصها أولًا، ثم استوردها بالأمر pnpm kb:import (راجع docs/DATA_IMPORT.md)."
            : "Anonymous counter (no user data). Use it to decide which manufacturer data to license first, then import it with pnpm kb:import (see docs/DATA_IMPORT.md)."}
        </p>
        {demand.length ? (
          <ul className="ticket divide-y divide-dashed divide-rule">
            {demand.map((d) => (
              <li key={`${d.code}-${d.make}`} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                <CodeTag code={d.code} />
                <span className="font-semibold">{d.make}</span>
                <span className="font-mono" dir="ltr">× {d.count}</span>
                <span className="ms-auto text-xs text-ink-3">{fmtDate(d.lastAt, locale)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">{ar ? "لا توجد طلبات بعد." : "No requests yet."}</p>
        )}
      </section>
    </div>
  );
}
