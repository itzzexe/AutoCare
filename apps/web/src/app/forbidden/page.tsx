import Link from "next/link";
import { Container } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";

export default async function Forbidden() {
  const { t } = await getDict();
  return (
    <Container narrow>
      <div className="ticket overflow-hidden">
        <div className="hazard" />
        <div className="space-y-3 p-8">
          <p className="font-display text-6xl font-bold text-signal" dir="ltr">403</p>
          <p className="text-lg">{t.errors.forbidden}</p>
          <Link className="btn" href="/">{t.common.back}</Link>
        </div>
      </div>
    </Container>
  );
}
