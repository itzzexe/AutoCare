import { MfaRequired, needsMfa } from "@/components/mfa-gate";
import { Container, Empty, PageHeader, Stamp, fmtDate } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requirePermission } from "@/server/http/session";
import { reviewQueue } from "@/server/modules/learning/service";
import { ReviewForm } from "./review-form";

export const metadata = { title: "المراجعة الفنية" };

export default async function ReviewPage() {
  const auth = await requirePermission("cases:review", "/review");
  const { t, locale } = await getDict();
  if (needsMfa(auth)) return <MfaRequired auth={auth} t={t} />;
  const queue = await reviewQueue(auth.user.id);
  return (
    <Container>
      <PageHeader title={t.nav.review} lead={locale === "ar" ? "راجع كل حالة مقابل الأدلة. الحالات المعتمدة فقط تدخل قاعدة المعرفة، وفقط لمن وافق على المساهمة. لا تعتمد حالة إن كان النص يحتوي بيانات شخصية." : "Check each case against its evidence. Only verified cases enter the knowledge base, and only for consenting users. Don't verify text that still contains personal data."} />
      {queue.length === 0 ? <Empty>{t.common.empty}</Empty> : null}
      <ul className="space-y-4">
        {queue.map((c) => (
          <li key={c.id} className="ticket">
            <div className="ticket-head"><span>{fmtDate(c.createdAt, locale)}</span><span dir="ltr">CASE-{c.id.slice(0, 8).toUpperCase()}</span></div>
            <div className="grid gap-5 p-5 lg:grid-cols-[1.3fr_1fr]">
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {c.codes.map((code) => <span key={code} className="code-tag text-xs">{code}</span>)}
                  <span className="font-semibold">{String(c.vehicleSnapshot.make ?? "")} {String(c.vehicleSnapshot.model ?? "")} {String(c.vehicleSnapshot.year ?? "")}</span>
                  <Stamp tone={c.status === "needs_review" ? "warn" : "info"}>{t.cases.status[c.status]}</Stamp>
                </div>
                {c.flags.length ? <div className="flex flex-wrap gap-1">{c.flags.map((f) => <Stamp key={f} tone="danger">{f}</Stamp>)}</div> : null}
                <p><span className="text-ink-3">{t.diagnose.symptoms}: </span>{c.symptoms || "—"}</p>
                <p><span className="text-ink-3">{t.cases.confirmedCause}: </span>{c.confirmedCause ?? "—"} <span className="text-ink-3">({t.cases.confirmedByList[c.confirmedBy]})</span></p>
                <p><span className="text-ink-3">{t.cases.repair}: </span>{c.repairPerformed ?? "—"}</p>
                <p><span className="text-ink-3">{t.cases.parts}: </span>{c.partsReplaced.map((p) => p.name).join("، ") || "—"}</p>
                <p><span className="text-ink-3">{t.cases.outcome}: </span>{t.cases.outcomes[c.outcome]}</p>
                {c.attachmentCount ? <p className="text-ink-3">{locale === "ar" ? "مرفقات" : "Attachments"}: {c.attachmentCount}</p> : null}
              </div>
              <ReviewForm caseId={c.id} canVerify={Boolean(c.confirmedCause)} />
            </div>
          </li>
        ))}
      </ul>
    </Container>
  );
}
