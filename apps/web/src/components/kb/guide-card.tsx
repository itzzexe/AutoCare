import Link from "next/link";
import type { Dict } from "@/i18n/ar";
import type { GuideSummary } from "@/server/modules/knowledge/library-service";
import { Stamp } from "../ui/bits";

export const urgencyTone = { stop_driving: "danger", urgent: "warn", soon: "info", monitor: "neutral" } as const;

export function GuideCard({ g, t, locale }: { g: GuideSummary; t: Dict; locale: "ar" | "en" }) {
  const cat = (t.kb.category as Record<string, string>)[g.category] ?? g.category;
  return (
    <Link href={`/guides/${g.slug}`} className="ticket group relative flex h-full flex-col overflow-hidden transition-colors hover:border-ink">
      {g.urgency === "stop_driving" ? <div className="hazard red" /> : null}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-mono">{cat}</span>
          <Stamp tone={urgencyTone[g.urgency]}>{t.kb.urgency[g.urgency]}</Stamp>
        </div>
        <h3 className="text-lg font-bold leading-snug group-hover:text-signal">{locale === "ar" ? g.titleAr : g.titleEn}</h3>
        <p className="text-sm text-ink-2">{locale === "ar" ? g.summaryAr : g.summaryEn}</p>
      </div>
    </Link>
  );
}
