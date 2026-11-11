import "./_env";
import { eq, isNotNull } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db/client";
import { merchants, orders, outbox, users, vehicles, workshops } from "../src/server/db/schema";
import { decryptField, encryptField, envelopeKeyId } from "../src/server/lib/crypto";

/**
 * Key rotation, step 2: after adding a new key to DATA_ENCRYPTION_KEYS and
 * switching DATA_ENCRYPTION_ACTIVE_KEY_ID, rewrite every envelope under the
 * active key. Remove the old key only after this reports nothing left to do.
 */
async function main() {
  const db = await getDb();
  const active = process.env.DATA_ENCRYPTION_ACTIVE_KEY_ID!;
  let rewritten = 0;
  const redo = (v: string, aad: string) => (envelopeKeyId(v) === active ? null : encryptField(decryptField(v, aad), aad));

  for (const v of await db.select().from(vehicles).where(isNotNull(vehicles.vinEnc))) {
    const n = redo(v.vinEnc!, `vehicle:${v.id}:vin`);
    if (n) { await db.update(vehicles).set({ vinEnc: n }).where(eq(vehicles.id, v.id)); rewritten++; }
  }
  for (const u of await db.select().from(users).where(isNotNull(users.mfaSecretEnc))) {
    const n = redo(u.mfaSecretEnc!, `mfa:${u.id}`);
    if (n) { await db.update(users).set({ mfaSecretEnc: n }).where(eq(users.id, u.id)); rewritten++; }
  }
  for (const m of await db.select().from(merchants)) {
    const n = redo(m.phoneEnc, `merchant:${m.id}:phone`);
    if (n) { await db.update(merchants).set({ phoneEnc: n }).where(eq(merchants.id, m.id)); rewritten++; }
  }
  for (const w of await db.select().from(workshops)) {
    const n = redo(w.phoneEnc, `workshop:${w.id}:phone`);
    if (n) { await db.update(workshops).set({ phoneEnc: n }).where(eq(workshops.id, w.id)); rewritten++; }
  }
  for (const o of await db.select().from(orders).where(isNotNull(orders.addressEnc))) {
    const n = redo(o.addressEnc!, `order:${o.id}:address`);
    if (n) { await db.update(orders).set({ addressEnc: n }).where(eq(orders.id, o.id)); rewritten++; }
  }
  for (const r of await db.select().from(outbox)) {
    const n = redo(r.payloadEnc, "outbox");
    if (n) { await db.update(outbox).set({ payloadEnc: n }).where(eq(outbox.id, r.id)); rewritten++; }
  }
  await closeDb();
  console.log(`re-encrypted ${rewritten} values under key ${active}`);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
