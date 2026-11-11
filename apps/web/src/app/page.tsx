import Link from "next/link";
import { SearchBox } from "@/components/search-box";
import { Icon } from "@/components/ui/icon";
import { getDict } from "@/i18n/server";
import { canonical, publicRobots } from "@/server/http/seo";
import { codeGroups, listGuides } from "@/server/modules/knowledge/library-service";

export function generateMetadata() {
  return { robots: publicRobots(), alternates: { canonical: canonical("/") } };
}

export default async function Home() {
  const { t, locale } = await getDict();
  const [groups, guides] = await Promise.all([codeGroups(), listGuides()]);
  const codeCount = groups.reduce((a, g) => a + g.n, 0);
  const symptomCats = (["warning_light", "starting", "engine", "cooling", "brakes", "noise", "smoke", "leak", "ac", "transmission"] as const).filter((c) => guides.some((g) => g.category === c));
  const examples = locale === "ar" ? ["P0300", "رجفة على الخمول", "دينمو", "U0100"] : ["P0300", "rough idle", "alternator", "U0100"];
  const tickets = [
    { n: "01", title: t.home.t1Title, body: t.home.t1Body, href: "/diagnose", icon: "wrench" },
    { n: "02", title: t.home.t2Title, body: t.home.t2Body, href: "/market", icon: "box" },
    { n: "03", title: t.home.t3Title, body: t.home.t3Body, href: "/workshops", icon: "pin" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero: service ticket + hanging inspection tags */}
      <section className="grid items-center gap-10 pb-10 pt-10 md:grid-cols-[1.35fr_1fr] md:pt-16">
        <div>
          <p className="label-mono rise mb-4 flex items-center gap-2">
            <span className="inline-block h-2 w-2 bg-signal" /> {t.home.kicker}
          </p>
          <h1 className="rise rise-1 text-[2.4rem] font-bold leading-[1.15] sm:text-6xl">{t.home.title}</h1>
          <p className="rise rise-2 mt-5 max-w-xl text-lg text-ink-2">{t.home.lead}</p>
          <div className="rise rise-3 mt-8 max-w-2xl">
            <SearchBox examples={examples} />
          </div>
        </div>

        <div aria-hidden="true" className="relative hidden h-80 md:block">
          <div className="absolute inset-x-6 top-0 border-t-2 border-dashed border-ink-3" />
          {[
            { code: "P0300", rot: "-rotate-6", pos: "start-6 top-6", delay: "rise-1" },
            { code: "P0171", rot: "rotate-3", pos: "start-40 top-20", delay: "rise-2" },
            { code: "U0100", rot: "-rotate-2", pos: "start-14 top-44", delay: "rise-3" },
          ].map((tag) => (
            <div key={tag.code} className={`rise ${tag.delay} absolute ${tag.pos} ${tag.rot}`}>
              <div className="mx-auto mb-1 h-6 w-px bg-ink-3" />
              <span className="code-tag lg shadow-[0_6px_0_-2px_var(--rule)]">{tag.code}</span>
            </div>
          ))}
          <div className="rise rise-4 absolute bottom-2 end-2 rotate-[-4deg]">
            <span className="stamp warn stamp-in text-base">{t.dtc.unreviewed}</span>
          </div>
        </div>
      </section>

      {/* Honest coverage notice */}
      <section className="ticket rise rise-4 mb-10 grid gap-5 p-5 sm:grid-cols-[auto_auto_1fr_auto] sm:items-center">
        <div>
          <div className="font-display text-5xl font-bold leading-none text-signal" dir="ltr">{codeCount}</div>
          <p className="label-mono mt-1">{t.home.codesUnit}</p>
        </div>
        <div>
          <div className="font-display text-5xl font-bold leading-none" dir="ltr">{guides.length}</div>
          <p className="label-mono mt-1">{t.home.guidesUnit}</p>
        </div>
        <div>
          <h2 className="text-lg font-bold">{t.home.coverageTitle}</h2>
          <p className="text-sm text-ink-2">{t.home.coverageBody}</p>
        </div>
        <div className="flex flex-col gap-2 self-start sm:self-center">
          <Link href="/codes" className="btn btn-sm">{t.home.browseLibrary}</Link>
          <Link href="/coverage" className="link text-sm">{t.home.coverageLink}</Link>
        </div>
      </section>

      {/* Symptom entry — for owners without a scanner */}
      {symptomCats.length ? (
        <section className="mb-10">
          <h2 className="text-2xl font-bold">{t.home.symptomTitle}</h2>
          <p className="mb-4 text-ink-2">{t.home.symptomLead}</p>
          <ul className="flex flex-wrap gap-2">
            {symptomCats.map((c) => (
              <li key={c}>
                <Link href={`/guides?c=${c}`} className="inline-block border-2 border-ink bg-card px-4 py-2 font-medium transition-colors hover:bg-ink hover:text-paper">{t.kb.category[c]}</Link>
              </li>
            ))}
            <li><Link href="/guides" className="inline-block px-4 py-2 font-medium link">{t.common.seeAll}</Link></li>
          </ul>
        </section>
      ) : null}

      {/* Three work tickets */}
      <section className="grid gap-5 md:grid-cols-3">
        {tickets.map((x) => (
          <Link key={x.n} href={x.href} className="ticket group block transition-transform hover:-translate-y-0.5">
            <div className="ticket-head">
              <span>{t.home.ticketNo}</span>
              <span dir="ltr">№ {x.n}</span>
            </div>
            <div className="p-5">
              <Icon name={x.icon} size={28} className="mb-3 text-signal" />
              <h3 className="mb-1 text-xl font-bold">{x.title}</h3>
              <p className="text-sm text-ink-2">{x.body}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-ink group-hover:text-signal">
                <Icon name="arrow" size={16} className="rtl:rotate-180" />
              </span>
            </div>
          </Link>
        ))}
      </section>

      {/* Safety strip */}
      <section className="mt-10 overflow-hidden border-2 border-ink bg-card">
        <div className="hazard" />
        <p className="flex items-start gap-3 px-5 py-4 font-medium">
          <Icon name="alert" size={22} className="mt-0.5 shrink-0 text-danger" />
          {t.home.safety}
        </p>
      </section>
    </div>
  );
}
