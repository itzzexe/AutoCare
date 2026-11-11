import Link from "next/link";
import { PlanCard, type PlanView } from "@/components/billing/plan-card";
import { Container, Notice, PageHeader } from "@/components/ui/bits";
import { Icon } from "@/components/ui/icon";
import { getDict } from "@/i18n/server";
import { canonical, publicRobots } from "@/server/http/seo";
import { publicPlans } from "@/server/modules/billing/service";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: t.billing.pricingKicker, description: t.billing.pricingLead, robots: publicRobots(), alternates: { canonical: canonical("/pricing") } };
}

export default async function PricingPage() {
  const { t, locale } = await getDict();
  const plans = (await publicPlans()) as PlanView[];
  const groups = (["owner", "workshop", "merchant"] as const).map((a) => ({ a, plans: plans.filter((p) => p.audience === a) })).filter((g) => g.plans.length);

  return (
    <Container>
      <PageHeader kicker={t.billing.pricingKicker} title={t.billing.pricingTitle} lead={t.billing.pricingLead} />
      <div className="mb-10 flex items-start gap-3 border-2 border-ink bg-card px-5 py-4">
        <Icon name="shield" size={22} className="mt-0.5 shrink-0 text-ok" />
        <p className="font-medium">{t.billing.alwaysFree}</p>
      </div>
      <div className="space-y-12">
        {groups.map(({ a, plans: ps }) => (
          <section key={a} aria-labelledby={`aud-${a}`}>
            <h2 id={`aud-${a}`} className="mb-4 text-2xl font-bold">{t.billing.audience[a]}</h2>
            <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {ps.map((p) => (
                <li key={p.id}>
                  <PlanCard
                    p={p}
                    t={t}
                    locale={locale}
                    action={p.tier === "paid" ? <Link href={`/account/billing?plan=${p.id}`} className="btn btn-primary w-full">{t.billing.choose}</Link> : null}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {plans.every((p) => p.tier === "free") ? <div className="mt-8"><Notice tone="info">{t.billing.priceNotSet}</Notice></div> : null}
    </Container>
  );
}
