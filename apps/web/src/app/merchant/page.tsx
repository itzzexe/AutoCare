import { Container, Notice, PageHeader, Stamp } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";
import { merchantOf, merchantOrdersFor, myProducts, openRequestsForMerchant } from "@/server/modules/market/service";
import { entitlementsFor, merchantStatement } from "@/server/modules/billing/service";
import { ApplyMerchant, MerchantConsole } from "./console";

export const metadata = { title: "لوحة التاجر" };

export default async function MerchantPage() {
  const auth = await requireAuth("/merchant");
  const { t, locale } = await getDict();
  const m = await merchantOf(auth.user.id);
  const isAr = locale === "ar";
  if (!m) {
    return (
      <Container narrow>
        <PageHeader title={t.nav.merchant} lead={isAr ? "سجّل محلك لتستقبل طلبات عروض الأسعار وتعرض قطعك. الحساب يُفعّل بعد مراجعة المشرف." : "Register your shop to receive quote requests and list parts. Activated after moderator review."} />
        <ApplyMerchant />
      </Container>
    );
  }
  if (m.status !== "approved" || !auth.user.roles.includes("merchant")) {
    return (
      <Container narrow>
        <PageHeader title={m.name} />
        <Notice tone={m.status === "approved" ? "info" : "warn"}>
          <Stamp tone={m.status === "approved" ? "ok" : "warn"}>{m.status}</Stamp>{" "}
          {m.status === "approved" ? (isAr ? "تمت الموافقة. سجّل الدخول من جديد لتفعيل الصلاحيات." : "Approved. Sign in again to activate permissions.") : isAr ? "بانتظار مراجعة المشرف." : "Awaiting moderator review."}
        </Notice>
      </Container>
    );
  }
  const [products, requests, orders, statement, ent] = await Promise.all([myProducts(auth.user.id), openRequestsForMerchant(auth.user.id), merchantOrdersFor(auth.user.id), merchantStatement(m.id), entitlementsFor("merchant", m.id)]);
  return (
    <Container>
      <PageHeader kicker={t.nav.merchant} title={m.name} />
      <MerchantConsole
        products={products.map((p) => ({ id: p.id, titleAr: p.titleAr, brand: p.brand, priceMinor: p.priceMinor, currency: p.currency, stockQty: p.stockQty, status: p.status, verified: Boolean(p.authenticityVerifiedAt), sponsored: p.sponsored }))}
        sponsorAllowance={ent.sponsoredProducts ?? 0}
        commissionBps={ent.commissionBps ?? 0}
        statement={{ totals: statement.totals, entries: statement.entries.map((e) => ({ id: e.id, merchantOrderId: e.merchantOrderId, baseMinor: e.baseMinor, rateBps: e.rateBps, amountMinor: e.amountMinor, currency: e.currency, status: e.status, createdAt: e.createdAt.toISOString() })) }}
        requests={requests.map((r) => ({ ...r, expiresAt: r.expiresAt.toISOString(), createdAt: r.createdAt.toISOString() }))}
        orders={orders.map((o) => ({ id: o.id, status: o.status, subtotalMinor: o.subtotalMinor, deliveryFeeMinor: o.deliveryFeeMinor, currency: o.currency, fulfilment: o.fulfilment, paymentMethod: o.paymentMethod, address: o.address, items: o.items.map((i) => ({ title: i.titleSnapshot, qty: i.quantity })), createdAt: o.createdAt.toISOString() }))}
      />
    </Container>
  );
}
