import Link from "next/link";
import { GuideCard } from "@/components/kb/guide-card";
import { Container, Empty, PageHeader } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { canonical, publicRobots } from "@/server/http/seo";
import { GUIDE_CATEGORIES, listGuides } from "@/server/modules/knowledge/library-service";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: t.kb.guidesTitle, description: t.kb.guidesLead, robots: publicRobots(), alternates: { canonical: canonical("/guides") } };
}

export default async function GuidesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const { t, locale } = await getDict();
  const category = GUIDE_CATEGORIES.find((x) => x === c);
  const all = await listGuides();
  const guides = category ? all.filter((g) => g.category === category) : all;
  const counts = new Map<string, number>();
  for (const g of all) counts.set(g.category, (counts.get(g.category) ?? 0) + 1);
  const cats = GUIDE_CATEGORIES.filter((x) => counts.has(x));
  const chip = (active: boolean) => `rounded-sm border px-3 py-1.5 text-sm transition-colors ${active ? "border-ink bg-ink text-paper" : "border-rule hover:border-ink"}`;

  return (
    <Container>
      <PageHeader kicker={t.kb.guidesKicker} title={t.kb.guidesTitle} lead={t.kb.guidesLead} />
      <nav aria-label={t.kb.guidesTitle} className="mb-6 flex flex-wrap gap-2">
        <Link href="/guides" className={chip(!category)} aria-current={!category ? "page" : undefined}>
          {t.kb.allCategories} <span className="font-mono text-xs opacity-70" dir="ltr">{all.length}</span>
        </Link>
        {cats.map((x) => (
          <Link key={x} href={`/guides?c=${x}`} className={chip(category === x)} aria-current={category === x ? "page" : undefined}>
            {t.kb.category[x]} <span className="font-mono text-xs opacity-70" dir="ltr">{counts.get(x)}</span>
          </Link>
        ))}
      </nav>
      {guides.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map((g) => (
            <li key={g.slug}><GuideCard g={g} t={t} locale={locale} /></li>
          ))}
        </ul>
      ) : (
        <Empty>{t.common.empty}</Empty>
      )}
      <p className="mt-8 text-xs text-ink-3">{t.kb.editorial}</p>
    </Container>
  );
}
