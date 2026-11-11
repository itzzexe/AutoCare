import Link from "next/link";
import { Container } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getDict();
  return (
    <Container narrow>
      <div className="ticket space-y-3 p-8">
        <span className="code-tag lg">404</span>
        <p className="text-lg">{t.errors.not_found}</p>
        <Link className="btn" href="/search">{t.nav.search}</Link>
      </div>
    </Container>
  );
}
