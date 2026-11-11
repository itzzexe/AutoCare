import { Container, Ltr, PageHeader, Stamp } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { openApiDocument } from "@/server/http/openapi";

export const metadata = { title: "API" };

export default async function Developers() {
  const { locale } = await getDict();
  const doc = openApiDocument();
  const ops = Object.entries(doc.paths).flatMap(([path, methods]) => Object.entries(methods).map(([m, op]) => ({ path, method: m, op: op as { summary: string; tags: string[]; security: unknown[] } })));
  const tags = [...new Set(ops.map((o) => o.op.tags[0]!))];
  return (
    <Container>
      <PageHeader
        kicker="OpenAPI 3.1"
        title="AutoCare IQ API v1"
        lead={locale === "ar" ? "واجهة واحدة للويب والتطبيقات القادمة. المخططات نفسها تُستخدم للتحقق في الخادم." : "One API for the web and the upcoming apps. The same schemas validate requests on the server."}
        actions={<a className="btn" href="/api/v1/openapi.json">openapi.json</a>}
      />
      {tags.map((tag) => (
        <section key={tag} className="mb-6">
          <h2 className="label-mono mb-2">{tag}</h2>
          <ul className="ticket divide-y divide-dashed divide-rule" dir="ltr">
            {ops.filter((o) => o.op.tags[0] === tag).map((o) => (
              <li key={o.method + o.path} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                <span className={`w-16 font-mono text-xs font-bold uppercase ${o.method === "get" ? "text-info" : o.method === "delete" ? "text-danger" : "text-signal"}`}>{o.method}</span>
                <Ltr className="text-xs">/api/v1{o.path}</Ltr>
                <span className="text-ink-2">{o.op.summary}</span>
                {o.op.security.length ? <Stamp tone="neutral">auth</Stamp> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Container>
  );
}
