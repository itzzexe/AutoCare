import "./_env";
import { and, isNotNull, lt, or } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db/client";
import { expireLapsed } from "../src/server/modules/billing/service";
import { aiUsage, auditEvents, notifications, offerRequests, orders, outbox, reportShares, sessions, userTokens } from "../src/server/db/schema";

/**
 * Retention job (run daily from cron/systemd timer). Periods are documented in
 * docs/PRIVACY_AND_CONSENT.md §Retention and must be confirmed by legal review.
 *   pnpm ops:retention [--dry-run]
 */
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

async function main() {
  const dry = process.argv.includes("--dry-run");
  const db = await getDb();
  const report: Record<string, number> = {};
  const run = async (name: string, fn: () => Promise<{ rowCount?: number | null } | unknown[]>) => {
    if (dry) return void (report[name] = -1);
    const r = await fn();
    report[name] = Array.isArray(r) ? r.length : (r as { rowCount?: number }).rowCount ?? 0;
  };

  await run("sessions_expired_or_revoked>30d", () => db.delete(sessions).where(or(lt(sessions.absoluteExpiresAt, ago(30)), and(isNotNull(sessions.revokedAt), lt(sessions.revokedAt, ago(30))))).returning({ id: sessions.id }));
  await run("one_time_tokens>7d", () => db.delete(userTokens).where(lt(userTokens.expiresAt, ago(7))).returning({ id: userTokens.id }));
  await run("outbox>30d", () => db.delete(outbox).where(lt(outbox.createdAt, ago(30))).returning({ id: outbox.id }));
  await run("report_shares_expired>30d", () => db.delete(reportShares).where(lt(reportShares.expiresAt, ago(30))).returning({ id: reportShares.id }));
  await run("notifications>180d", () => db.delete(notifications).where(lt(notifications.createdAt, ago(180))).returning({ id: notifications.id }));
  await run("ai_usage>400d", () => db.delete(aiUsage).where(lt(aiUsage.createdAt, ago(400))).returning({ id: aiUsage.id }));
  await run("subscriptions_expire", async () => [...Array(await expireLapsed())]);
  await run("offer_requests_expire", () => db.update(offerRequests).set({ status: "expired" }).where(and(lt(offerRequests.expiresAt, new Date()))).returning({ id: offerRequests.id }));
  // Delivery addresses are only needed for fulfilment + disputes.
  await run("order_addresses>120d", () => db.update(orders).set({ addressEnc: null }).where(and(isNotNull(orders.addressEnc), lt(orders.createdAt, ago(120)))).returning({ id: orders.id }));
  // Audit log is append-only for the app role; pruning runs with the owner role.
  if (process.env.DATABASE_MIGRATION_URL || !process.env.DATABASE_URL) {
    await run("audit_events>365d", () => db.delete(auditEvents).where(lt(auditEvents.at, ago(365))).returning({ id: auditEvents.id }));
  }
  await closeDb();
  console.log(JSON.stringify({ dryRun: dry, ...report }, null, 2));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
