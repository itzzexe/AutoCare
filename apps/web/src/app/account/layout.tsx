import Link from "next/link";
import { Container, Notice } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";

export const metadata = { title: "حسابي" };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth("/account");
  const { t } = await getDict();
  const links = [
    { href: "/account", label: t.account.profile },
    { href: "/account/security", label: t.account.security },
    { href: "/account/privacy", label: t.account.privacy },
    { href: "/account/notifications", label: t.nav.notifications },
    { href: "/account/billing", label: t.nav.billing },
  ];
  return (
    <Container>
      <div className="grid gap-8 lg:grid-cols-[13rem_1fr]">
        <nav aria-label={t.account.title} className="lg:sticky lg:top-24 lg:self-start">
          <p className="label-mono mb-2">{t.account.title}</p>
          <ul className="flex flex-wrap gap-1 lg:flex-col">
            {links.map((l) => <li key={l.href}><Link href={l.href} className="block border-s-2 border-rule px-3 py-1.5 text-sm hover:border-signal hover:bg-card">{l.label}</Link></li>)}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
          {!auth.user.emailVerified ? <Notice tone="warn">{t.account.emailUnverified}</Notice> : null}
          {children}
        </div>
      </div>
    </Container>
  );
}
