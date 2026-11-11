import Link from "next/link";
import { CodeTag, Container, Empty, PageHeader, Stamp } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { canonical, publicRobots } from "@/server/http/seo";
import { codeGroups, listCodes } from "@/server/modules/knowledge/library-service";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: t.kb.libraryTitle, description: t.kb.libraryLead, robots: publicRobots(), alternates: { canonical: canonical("/codes") } };
}

const urgencyTone = { urgent: "warn", soon: "info", monitor: "neutral" } as const;

export default async function CodeLibrary({ searchParams }: { searchParams: Promise<{ g?: string; page?: string }> }) {
  const sp = await searchParams;
  const { t, locale } = await getDict();
  const group = sp.g && /^[PBCU][0-9A-F]{0,2}$/.test(sp.g) ? sp.g : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [groups, list] = await Promise.all([codeGroups(), listCodes({ prefix: group, page, pageSize: 60 })]);
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const total = groups.reduce((a, g) => a + g.n, 0);
  const href = (g?: string, p?: number) => `/codes${g || p ? `?${new URLSearchParams({ ...(g ? { g } : {}), ...(p && p > 1 ? { page: String(p) } : {}) })}` : ""}`;
  const bySystem = (["P", "B", "C", "U"] as const).map((s) => ({ s, groups: groups.filter((g) => g.group.startsWith(s)) })).filter((x) => x.groups.length);

  return (
    <Container>
      <PageHeader kicker={t.kb.libraryKicker} title={t.kb.libraryTitle} lead={t.kb.libraryLead} actions={<span className="label-mono" dir="ltr">{total} {t.kb.total}</span>} />
      <div className="grid gap-8 lg:grid-cols-[15rem_1fr]">
        <nav aria-label={t.kb.groups} className="space-y-4 text-sm">
          <Link href={href()} className={`block ${!group ? "font-bold text-signal" : "link"}`}>{t.kb.allCategories}</Link>
          {bySystem.map(({ s, groups: gs }) => (
            <div key={s}>
              <p className="label-mono mb-1">{s} · {t.kb.systems[s]}</p>
              <ul className="flex flex-wrap gap-1.5">
                {gs.map((g) => (
                  <li key={g.group}>
                    <Link href={href(g.group)} aria-current={group === g.group ? "page" : undefined}
                      className={`inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-xs ${group === g.group ? "border-ink bg-ink text-paper" : "border-rule hover:border-ink"}`} dir="ltr">
                      {g.group}xx <span className="opacity-60">{g.n}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div>
          {list.items.length ? (
            <ul className="ticket divide-y divide-dashed divide-rule">
              {list.items.map((c) => (
                <li key={c.code}>
                  <Link href={`/codes/${c.code}`} className="group flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-paper-2">
                    <CodeTag code={c.code} />
                    <span className="min-w-0 flex-1 font-medium group-hover:text-signal">{locale === "ar" ? c.titleAr : c.titleEn}</span>
                    {c.safetyArea !== "none" ? <Stamp tone="danger">{t.dtc.safety}</Stamp> : null}
                    <Stamp tone={urgencyTone[c.baseUrgency as keyof typeof urgencyTone] ?? "neutral"}>{t.kb.urgency[c.baseUrgency as keyof typeof t.kb.urgency]}</Stamp>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t.search.none}</Empty>
          )}
          {pages > 1 ? (
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label={t.kb.page}>
              {page > 1 ? <Link className="btn btn-sm" href={href(group, page - 1)}>{t.kb.prev}</Link> : <span />}
              <span className="label-mono" dir="ltr">{page} / {pages}</span>
              {page < pages ? <Link className="btn btn-sm" href={href(group, page + 1)}>{t.kb.nextPage}</Link> : <span />}
            </nav>
          ) : null}
          <p className="mt-6 text-xs text-ink-3">{t.kb.editorial}</p>
        </div>
      </div>
    </Container>
  );
}
