import { notFound } from "next/navigation";
import { Container, Notice, PageHeader } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { CONSENT_TEXT_VERSION } from "@/server/modules/learning/service";
import { LEGAL } from "./content";

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = LEGAL[doc as keyof typeof LEGAL];
  if (!d) notFound();
  const { locale } = await getDict();
  const c = d[locale];
  return (
    <Container narrow>
      <PageHeader kicker={`${d.version}${doc === "learning-consent" ? ` · ${CONSENT_TEXT_VERSION}` : ""}`} title={c.title} />
      <Notice tone="warn">{locale === "ar" ? "مسودة للمراجعة القانونية المحلية. ليست نصًا نهائيًا ولا تمثل ادعاء امتثال." : "Draft for local legal review. Not final, and not a compliance claim."}</Notice>
      <article className="mt-6 space-y-6">
        {c.sections.map((s) => (
          <section key={s.h}>
            <h2 className="mb-2 text-xl font-bold">{s.h}</h2>
            {s.p.map((p, i) => <p key={i} className="mb-2 text-ink-2">{p}</p>)}
          </section>
        ))}
      </article>
    </Container>
  );
}
