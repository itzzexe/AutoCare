import { Container, PageHeader } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";
import { getCart } from "@/server/modules/market/service";
import { availableGateways } from "@/server/modules/payments/gateways";
import { env } from "@/server/config/env";
import { CartView } from "./cart-view";

export const metadata = { title: "السلة" };

export default async function CartPage() {
  const auth = await requireAuth("/cart");
  const { t, locale } = await getDict();
  const gateways = availableGateways().map((g) => ({ id: g.id, name: locale === "ar" ? g.nameAr : g.nameEn, minAmountIqd: g.minAmountIqd }));
  const testGateway = Boolean(env().PAYMENT_TEST_WEBHOOK_SECRET);
  const cart = await getCart(auth.user.id);
  return (
    <Container>
      <PageHeader title={t.market.cart} />
      <CartView cart={cart} emailVerified={auth.user.emailVerified} gateways={gateways} testGateway={testGateway} />
    </Container>
  );
}
