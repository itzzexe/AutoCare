import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { I18nProvider } from "@/components/i18n";
import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader } from "@/components/shell/site-header";
import { getDict } from "@/i18n/server";
import "../fonts/fonts.css";
import "./globals.css";


export const metadata: Metadata = {
  title: { default: "أوتوكير IQ", template: "%s · أوتوكير IQ" },
  description: "تفسير أكواد أعطال السيارات بالمصادر، وتشخيص إرشادي، وقطع وورش في العراق.",
  applicationName: "AutoCare IQ",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2eee5" },
    { media: "(prefers-color-scheme: dark)", color: "#121210" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { t, locale, dir } = await getDict();
  const theme = (await cookies()).get("acq_theme")?.value;
  return (
    // Browser extensions (e.g. "webcrx") add attributes to <html> before hydration.
    // This only silences attribute mismatches on this one element, not on its children.
    <html lang={locale} dir={dir} data-theme={theme === "dark" || theme === "light" ? theme : undefined} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col antialiased">
        <I18nProvider t={t} locale={locale}>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 btn">
            {t.nav.skip}
          </a>
          <SiteHeader />
          <main id="main" className="flex-1 pb-24 md:pb-10">
            {children}
          </main>
          <SiteFooter />
        </I18nProvider>
      </body>
    </html>
  );
}
