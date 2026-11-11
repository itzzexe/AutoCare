import Link from "next/link";
import { redirect } from "next/navigation";
import { MfaRequired, needsMfa } from "@/components/mfa-gate";
import { Container } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";

export const metadata = { title: "الإدارة" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth("/admin");
  const { t, locale } = await getDict();
  const p = auth.permissions;
  if (![...p].some((x) => x.startsWith("admin:") || x.startsWith("moderation:") || x === "knowledge:manage")) redirect("/forbidden");
  if (needsMfa(auth)) return <MfaRequired auth={auth} t={t} />;
  const ar = locale === "ar";
  const links = [
    { href: "/admin", label: ar ? "نظرة عامة" : "Overview", show: p.has("admin:audit") },
    { href: "/admin/users", label: ar ? "المستخدمون والأدوار" : "Users & roles", show: p.has("admin:users") },
    { href: "/admin/moderation", label: ar ? "الإشراف" : "Moderation", show: p.has("moderation:merchants") || p.has("moderation:content") },
    { href: "/admin/providers", label: ar ? "المزوّدون والتغطية" : "Providers & coverage", show: p.has("admin:providers") },
    { href: "/admin/learning", label: ar ? "البيانات والنماذج" : "Datasets & models", show: p.has("admin:learning") },
    { href: "/admin/billing", label: ar ? "الإيرادات والباقات" : "Revenue & plans", show: p.has("admin:billing") },
    { href: "/admin/audit", label: ar ? "سجل التدقيق" : "Audit log", show: p.has("admin:audit") },
    { href: "/admin/outbox", label: ar ? "صندوق التطوير" : "Dev outbox", show: p.has("admin:dev_outbox") },
  ].filter((l) => l.show);
  return (
    <Container>
      <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
        <nav aria-label={t.admin.title} className="lg:sticky lg:top-24 lg:self-start">
          <p className="label-mono mb-2">{t.admin.title}</p>
          <ul className="flex flex-wrap gap-1 lg:flex-col">
            {links.map((l) => <li key={l.href}><Link href={l.href} className="block border-s-2 border-rule px-3 py-1.5 text-sm hover:border-signal hover:bg-card">{l.label}</Link></li>)}
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}
