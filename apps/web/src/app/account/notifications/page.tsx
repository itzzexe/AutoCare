import Link from "next/link";
import { Empty, PageHeader, fmtDate } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";
import { markNotificationsRead, myNotifications } from "@/server/modules/account/service";
import { sweepDueReminders } from "@/server/modules/maintenance/service";

export default async function NotificationsPage() {
  const auth = await requireAuth("/account/notifications");
  const { t, locale } = await getDict();
  await sweepDueReminders(auth.user.id);
  const items = await myNotifications(auth.user.id);
  await markNotificationsRead(auth.user.id);
  return (
    <>
      <PageHeader title={t.nav.notifications} lead={locale === "ar" ? "تنبيهات داخل التطبيق فقط. البريد والرسائل النصية غير مهيأة بعد." : "In-app notifications only. Email/SMS are not configured yet."} />
      {items.length === 0 ? <Empty>{t.common.empty}</Empty> : (
        <ul className="ticket divide-y divide-dashed divide-rule">
          {items.map((n) => (
            <li key={n.id} className={`flex flex-wrap items-center justify-between gap-2 p-4 ${n.readAt ? "" : "border-s-4 border-signal"}`}>
              <div>
                {/* Only internal relative links are stored; they are rendered as plain Next links. */}
                {n.link && n.link.startsWith("/") && !n.link.startsWith("//") ? <Link className="font-medium hover:text-signal" href={n.link}>{locale === "ar" ? n.titleAr : n.titleEn}</Link> : <span className="font-medium">{locale === "ar" ? n.titleAr : n.titleEn}</span>}
              </div>
              <span className="text-xs text-ink-3">{fmtDate(n.createdAt, locale, true)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
