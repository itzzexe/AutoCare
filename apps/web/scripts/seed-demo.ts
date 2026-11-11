import "./_env";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db/client";
import { seedBase } from "../src/server/db/seed";
import { merchantMembers, merchants, plans, products, partFitments, userRoles, users, workshopMembers, workshops } from "../src/server/db/schema";
import { encryptField } from "../src/server/lib/crypto";
import { hashPassword } from "../src/server/modules/identity/password";

/**
 * DEMO data for local evaluation only. Everything is labelled [تجريبي]/[DEMO],
 * accounts use the reserved .invalid domain and get RANDOM passwords printed
 * once. Refused unless ALLOW_DEMO_SEED=true and APP_ENV is not production/staging.
 */
async function main() {
  const envName = process.env.APP_ENV ?? "development";
  if (envName === "production" || envName === "staging") throw new Error("Refusing to seed demo data in production/staging.");
  if (process.env.ALLOW_DEMO_SEED !== "true") throw new Error("Set ALLOW_DEMO_SEED=true (development only) to seed demo data.");
  const db = await getDb();
  await seedBase(db);
  // DEMO prices only, so the pricing and billing flows can be exercised locally.
  // Real prices are a business decision made by the operator in /admin/billing.
  for (const [id, price] of [["owner_pro", 5_000], ["workshop_featured", 25_000], ["merchant_pro", 25_000]] as const) {
    await db.update(plans).set({ priceMinor: price, published: true }).where(eq(plans.id, id));
  }

  const created: Array<{ role: string; email: string; password: string }> = [];
  async function account(email: string, name: string, roles: string[]) {
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) return existing.id;
    const password = randomBytes(12).toString("base64url");
    const [u] = await db.insert(users).values({ email, passwordHash: await hashPassword(password), displayName: name, emailVerifiedAt: new Date(), passwordChangedAt: new Date() }).returning({ id: users.id });
    for (const r of roles) await db.insert(userRoles).values({ userId: u!.id, roleId: r }).onConflictDoNothing();
    created.push({ role: roles.join("+"), email, password });
    return u!.id;
  }

  const owner = await account("owner@demo.invalid", "[تجريبي] أحمد", ["vehicle_owner"]);
  const m1 = await account("merchant.karrada@demo.invalid", "[تجريبي] تاجر الكرادة", ["vehicle_owner", "merchant"]);
  const m2 = await account("merchant.basra@demo.invalid", "[تجريبي] تاجر البصرة", ["vehicle_owner", "merchant"]);
  const ws = await account("workshop@demo.invalid", "[تجريبي] ورشة", ["vehicle_owner", "workshop"]);
  await account("reviewer@demo.invalid", "[تجريبي] مراجع فني", ["vehicle_owner", "technical_reviewer"]);
  await account("moderator@demo.invalid", "[تجريبي] مشرف", ["vehicle_owner", "moderator"]);
  void owner;

  const existingShops = await db.select().from(merchants).limit(1);
  if (!existingShops.length) {
    const shops = [
      { owner: m1, name: "[تجريبي] قطع الكرادة", governorate: "BGD", city: "الكرادة" },
      { owner: m2, name: "[تجريبي] مخزن العشار", governorate: "BSR", city: "العشار" },
    ];
    for (const s of shops) {
      const id = crypto.randomUUID();
      await db.insert(merchants).values({ id, ownerUserId: s.owner, name: s.name, governorate: s.governorate, city: s.city, phoneEnc: encryptField("07700000000", `merchant:${id}:phone`), status: "approved", description: "DEMO" });
      await db.insert(merchantMembers).values({ merchantId: id, userId: s.owner, role: "owner" });
      const items = [
        { titleAr: "قماشات فرامل أمامية", titleEn: "Front brake pads", brand: "Akebono", category: "brakes", oe: ["04465-02220"], price: 45_000, fit: [{ make: "Toyota", model: "Corolla", yearFrom: 2014, yearTo: 2019 }] },
        { titleAr: "كويل إشعال", titleEn: "Ignition coil", brand: "Denso", category: "ignition", oe: ["90919-02252"], price: 38_000, fit: [{ make: "Toyota", model: "Camry", yearFrom: 2012, yearTo: 2017 }] },
        { titleAr: "دينمو مجدد", titleEn: "Remanufactured alternator", brand: "Bosch", category: "electrical", oe: ["37300-2B100"], price: 160_000, fit: [{ make: "Hyundai", model: "Elantra", yearFrom: 2011, yearTo: 2016 }] },
        { titleAr: "حساس أوكسجين أمامي", titleEn: "Upstream O2 sensor", brand: "NGK", category: "sensors", oe: ["39210-2B320"], price: 70_000, fit: [{ make: "Kia", model: "Cerato", yearFrom: 2013, yearTo: 2018 }] },
      ];
      for (const it of items) {
        const [p] = await db
          .insert(products)
          .values({
            merchantId: id, titleAr: `[تجريبي] ${it.titleAr}`, titleEn: `[DEMO] ${it.titleEn}`, brand: it.brand, category: it.category, oeNumbers: it.oe, oeKeys: it.oe.map((o) => o.replace(/-/g, "")),
            condition: it.titleAr.includes("مجدد") ? "refurbished" : "new", authenticityClaim: "oem_equivalent", priceMinor: it.price + (s.governorate === "BSR" ? 5_000 : 0), currency: "IQD",
            stockQty: 4, warrantyDays: 90, returnDays: 7, deliveryOptions: ["pickup", "delivery"], searchKey: `${it.titleAr} ${it.titleEn} ${it.brand} ${it.oe.join(" ")}`.toLowerCase(),
          })
          .returning({ id: products.id });
        await db.insert(partFitments).values(it.fit.map((f) => ({ productId: p!.id, ...f, source: "merchant_claim" as const })));
      }
    }
  }
  const existingWs = await db.select().from(workshops).limit(1);
  if (!existingWs.length) {
    const id = crypto.randomUUID();
    await db.insert(workshops).values({ id, ownerUserId: ws, name: "[تجريبي] ورشة الدقة للفحص", governorate: "BGD", city: "الكرادة", address: "شارع ٦٢ — بيانات تجريبية", phoneEnc: encryptField("07700000001", `workshop:${id}:phone`), specialties: ["engine", "diagnostics", "electrical"], brands: ["Toyota", "Hyundai", "Kia"], status: "approved" });
    await db.insert(workshopMembers).values({ workshopId: id, userId: ws, role: "owner" });
  }
  await closeDb();
  console.log("Demo data ready (labelled [تجريبي]/[DEMO]). New accounts — passwords shown once:");
  for (const c of created) console.log(`  ${c.role.padEnd(28)} ${c.email}  ${c.password}`);
  if (!created.length) console.log("  (accounts already existed; passwords unchanged)");
  console.log("Privileged demo roles (reviewer/moderator) must enrol MFA before their pages unlock.");
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
