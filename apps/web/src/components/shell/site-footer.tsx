import Link from "next/link";
import { getDict } from "@/i18n/server";

export async function SiteFooter() {
  const { t } = await getDict();
  return (
    <footer className="no-print hidden border-t border-rule md:block">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-6 px-4 py-8 text-sm text-ink-3">
        <div className="max-w-md space-y-1">
          <p className="text-ink-2">{t.footer.note}</p>
          <p className="label-mono">{t.footer.draft}</p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link className="link" href="/guides">{t.footer.guides}</Link>
          <Link className="link" href="/codes">{t.footer.library}</Link>
          <Link className="link" href="/pricing">{t.footer.pricing}</Link>
          <Link className="link" href="/coverage">{t.footer.coverage}</Link>
          <Link className="link" href="/legal/privacy">{t.footer.privacy}</Link>
          <Link className="link" href="/legal/terms">{t.footer.terms}</Link>
          <Link className="link" href="/developers">{t.footer.api}</Link>
        </nav>
      </div>
    </footer>
  );
}
