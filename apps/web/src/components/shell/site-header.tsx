import Link from "next/link";
import { getDict } from "@/i18n/server";
import { currentAuth } from "@/server/http/session";
import { HeaderControls } from "./header-controls";
import { MobileTabBar } from "./mobile-tab-bar";
import { Wordmark } from "./wordmark";

export async function SiteHeader() {
  const { t } = await getDict();
  const auth = await currentAuth();
  const roles = auth?.user.roles ?? [];
  const links = [
    { href: "/search", label: t.nav.search },
    { href: "/guides", label: t.nav.guides },
    { href: "/garage", label: t.nav.garage },
    { href: "/diagnose", label: t.nav.diagnose },
    { href: "/market", label: t.nav.market },
    { href: "/workshops", label: t.nav.workshops },
  ];
  const consoles = [
    roles.includes("merchant") ? { href: "/merchant", label: t.nav.merchant } : null,
    roles.includes("workshop") ? { href: "/workshop", label: t.nav.workshopConsole } : null,
    roles.includes("technical_reviewer") ? { href: "/review", label: t.nav.review } : null,
    roles.some((r) => r === "sysadmin" || r === "moderator") ? { href: "/admin", label: t.nav.admin } : null,
  ].filter((x): x is { href: string; label: string } => x !== null);

  return (
    <>
      <header className="no-print sticky top-0 z-30 border-b border-rule bg-[color-mix(in_oklab,var(--paper)_88%,transparent)] backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Wordmark name={t.brand.name} suffix={t.brand.suffix} />
          <nav aria-label={t.nav.menu} className="hidden flex-1 items-center gap-1 md:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-sm px-3 py-2 text-[0.92rem] font-medium text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink">
                {l.label}
              </Link>
            ))}
          </nav>
          <HeaderControls
            signedIn={Boolean(auth)}
            displayName={auth?.user.displayName ?? null}
            consoles={consoles}
            labels={{ login: t.nav.login, register: t.nav.register, account: t.nav.account, logout: t.nav.logout, cases: t.nav.cases, language: t.nav.language, theme: t.nav.theme, notifications: t.nav.notifications, menu: t.nav.menu }}
          />
        </div>
      </header>
      <MobileTabBar
        items={[
          { href: "/search", label: t.nav.search, icon: "search" },
          { href: "/garage", label: t.nav.garage, icon: "car" },
          { href: "/diagnose", label: t.nav.diagnose, icon: "wrench" },
          { href: "/market", label: t.nav.market, icon: "box" },
          { href: "/workshops", label: t.nav.workshops, icon: "pin" },
        ]}
      />
    </>
  );
}
