import { notFound } from "next/navigation";
import { Container, Notice, Stamp, fmtDate } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { currentAuth } from "@/server/http/session";
import { listSessions } from "@/server/modules/diagnostics/service";
import { publicReviews } from "@/server/modules/market/service";
import { listVehicles } from "@/server/modules/vehicles/service";
import { directory } from "@/server/modules/workshops/service";
import { BookingForm } from "./booking-form";

export default async function WorkshopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const w = (await directory({})).find((x) => x.id === id);
  if (!w) notFound();
  const { t, locale } = await getDict();
  const auth = await currentAuth();
  const [reviews, vehicles, sessions] = await Promise.all([
    publicReviews("workshop", id),
    auth ? listVehicles(auth.user.id) : Promise.resolve([]),
    auth ? listSessions(auth.user.id) : Promise.resolve([]),
  ]);
  return (
    <Container>
      <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <article className="space-y-5">
          <div className="ticket p-6">
            <h1 className="text-3xl font-bold">{w.name}</h1>
            <p className="mt-1 text-ink-2">{w.city} · {w.address}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">{w.specialties.map((s) => <Stamp key={s} tone="info">{t.workshops.specialties[s as keyof typeof t.workshops.specialties] ?? s}</Stamp>)}</div>
          </div>
          <section className="ticket">
            <div className="ticket-head"><span>{t.market.review}</span><span>{reviews.count ? `★ ${reviews.average!.toFixed(1)} · ${reviews.count}` : t.workshops.noRating}</span></div>
            <ul className="divide-y divide-dashed divide-rule">
              {reviews.items.map((r) => (
                <li key={r.id} className="p-4 text-sm">
                  <p className="font-semibold" dir="ltr">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</p>
                  {r.body ? <p className="text-ink-2">{r.body}</p> : null}
                  <p className="text-xs text-ink-3">{fmtDate(r.createdAt, locale)}</p>
                </li>
              ))}
              {!reviews.items.length ? <li className="p-4 text-sm text-ink-3">{t.workshops.noRating}</li> : null}
            </ul>
          </section>
        </article>
        <aside className="ticket self-start p-5">
          <h2 className="mb-4 text-xl font-bold">{t.workshops.book}</h2>
          {auth ? (
            vehicles.length ? (
              <BookingForm workshopId={w.id} vehicles={vehicles.map((v) => ({ id: v.id, label: `${v.make} ${v.model} ${v.year}` }))} sessions={sessions.filter((s) => s.status === "completed").map((s) => ({ id: s.id, label: `${s.codes.map((c) => c.code).join(", ") || s.symptoms.slice(0, 40)} · ${fmtDate(s.updatedAt, locale)}` }))} />
            ) : <Notice>{t.diagnose.needVehicle}</Notice>
          ) : <Notice>{t.common.signInToUse}</Notice>}
        </aside>
      </div>
    </Container>
  );
}
