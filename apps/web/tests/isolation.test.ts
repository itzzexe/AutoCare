
import { beforeAll, describe, expect, it } from "vitest";
import { DELETE as deleteVehicleRoute, GET as getVehicleRoute, PATCH as patchVehicleRoute } from "@/app/api/v1/vehicles/[id]/route";
import { GET as getSessionRoute } from "@/app/api/v1/diagnostics/[id]/route";
import { DELETE as revokeShareRoute } from "@/app/api/v1/shares/[id]/route";
import { GET as merchantRequestsRoute } from "@/app/api/v1/merchant/requests/route";
import { GET as reviewQueueRoute } from "@/app/api/v1/review/cases/route";
import { GET as adminUsersRoute } from "@/app/api/v1/admin/users/route";
import { getDb } from "@/server/db/client";
import { merchants, workshops } from "@/server/db/schema";
import * as diag from "@/server/modules/diagnostics/service";
import * as learning from "@/server/modules/learning/service";
import * as market from "@/server/modules/market/service";
import * as ws from "@/server/modules/workshops/service";
import { createVehicle } from "@/server/modules/vehicles/service";
import { freshDb, json, makeUser, params, req } from "./support/db";

const car = { make: "Hyundai", model: "Elantra", year: 2017, fuel: "petrol", transmission: "automatic", salesMarket: "GCC", odometerUnit: "km" } as const;

let alice: Awaited<ReturnType<typeof makeUser>>;
let bob: Awaited<ReturnType<typeof makeUser>>;
let aliceVehicle: Awaited<ReturnType<typeof createVehicle>>;
let aliceSession: string;

beforeAll(async () => {
  await freshDb();
  alice = await makeUser();
  bob = await makeUser();
  aliceVehicle = await createVehicle(alice.id, { ...car, vin: "KMHDH41EXHU000001" });
  aliceSession = (await diag.startSession(alice.id, { vehicleId: aliceVehicle.id, codes: ["P0301"], symptoms: "رجفة" })).session.id;
});

describe("vehicles & diagnostics (BOLA)", () => {
  it("another user gets 404 (not 403) for someone else's vehicle — read, update, delete", async () => {
    const p = params({ id: aliceVehicle.id });
    expect((await getVehicleRoute(req("GET", `/api/v1/vehicles/${aliceVehicle.id}`, { user: bob }), p)).status).toBe(404);
    expect((await patchVehicleRoute(req("PATCH", `/api/v1/vehicles/${aliceVehicle.id}`, { user: bob, body: { nickname: "mine now" } }), p)).status).toBe(404);
    expect((await deleteVehicleRoute(req("DELETE", `/api/v1/vehicles/${aliceVehicle.id}`, { user: bob }), p)).status).toBe(404);
    const own = await json(await getVehicleRoute(req("GET", `/api/v1/vehicles/${aliceVehicle.id}`, { user: alice }), p));
    expect(own.status).toBe(200);
    expect(own.body.vinMasked).toBe("KMH••••••••••0001");
    expect(JSON.stringify(own.body)).not.toContain("KMHDH41EXHU000001");
  });

  it("another user cannot read a diagnostic session or start one on someone else's vehicle", async () => {
    expect((await getSessionRoute(req("GET", `/api/v1/diagnostics/${aliceSession}`, { user: bob }), params({ id: aliceSession }))).status).toBe(404);
    await expect(diag.startSession(bob.id, { vehicleId: aliceVehicle.id, codes: [], symptoms: "" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("only the creator can revoke a share link; workshop-restricted shares need membership", async () => {
    const share = await diag.createShare(alice.id, aliceSession, 24, undefined);
    expect((await revokeShareRoute(req("DELETE", `/api/v1/shares/${share.id}`, { user: bob }), params({ id: share.id }))).status).toBe(404);
    const opened = await diag.openShare(share.token, null);
    expect(JSON.stringify(opened)).not.toContain("KMHDH41EXHU000001");
    expect(JSON.stringify(opened)).not.toContain(alice.email);

    const db = await getDb();
    const owner = await makeUser();
    const [w] = await db.insert(workshops).values({ ownerUserId: owner.id, name: "W", governorate: "BGD", city: "Karrada", address: "x", phoneEnc: "v1.t1.a.b.c", specialties: ["engine"], status: "approved" }).returning();
    const restricted = await diag.createShare(alice.id, aliceSession, 24, w!.id);
    await expect(diag.openShare(restricted.token, null)).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(diag.openShare(restricted.token, bob.id)).rejects.toMatchObject({ code: "not_found" });

    await diag.revokeShare(alice.id, share.id);
    await expect(diag.openShare(share.token, null)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("role separation", () => {
  it("a plain owner cannot reach merchant, reviewer or admin endpoints", async () => {
    expect((await merchantRequestsRoute(req("GET", "/api/v1/merchant/requests", { user: alice }), params())).status).toBe(403);
    expect((await reviewQueueRoute(req("GET", "/api/v1/review/cases", { user: alice }), params())).status).toBe(403);
    expect((await adminUsersRoute(req("GET", "/api/v1/admin/users", { user: alice }), params())).status).toBe(403);
  });

  it("privileged roles need an MFA-verified session", async () => {
    const admin = await makeUser(["vehicle_owner", "sysadmin"], { mfa: false });
    const r = await json(await adminUsersRoute(req("GET", "/api/v1/admin/users", { user: admin }), params()));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("mfa_required");
    const adminMfa = await makeUser(["vehicle_owner", "sysadmin"], { mfa: true });
    expect((await adminUsersRoute(req("GET", "/api/v1/admin/users", { user: adminMfa }), params())).status).toBe(200);
  });

  it("reviewers see cases without the submitter's identity and cannot review their own case", async () => {
    const reviewer = await makeUser(["vehicle_owner", "technical_reviewer"], { mfa: true });
    const c = await learning.submitCase(alice.id, { vehicleId: aliceVehicle.id, codes: ["P0301"], symptoms: "misfire", measurements: [], confirmedCause: "coil", confirmedBy: "mechanic", partsReplaced: [], outcome: "resolved", attachmentIds: [] });
    const q = await json(await reviewQueueRoute(req("GET", "/api/v1/review/cases", { user: reviewer }), params()));
    const item = q.body.items.find((x: { id: string }) => x.id === c.id);
    expect(item).toBeTruthy();
    expect(item.userId).toBeUndefined();
    expect(item.vehicleId).toBeUndefined();
    const own = await learning.submitCase(reviewer.id, { codes: [], symptoms: "x", measurements: [], confirmedCause: "y", confirmedBy: "owner", partsReplaced: [], outcome: "resolved", attachmentIds: [] });
    await expect(learning.reviewCase(reviewer.id, own.id, { decision: "verified", notes: "self", evidence: [] })).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("merchant isolation", () => {
  it("merchants see anonymised requests only in their governorate and cannot touch other merchants' products or orders", async () => {
    const db = await getDb();
    const m1 = await makeUser(["vehicle_owner", "merchant"]);
    const m2 = await makeUser(["vehicle_owner", "merchant"]);
    const [shop1] = await db.insert(merchants).values({ ownerUserId: m1.id, name: "Shop 1", governorate: "BGD", city: "Sinak", phoneEnc: "v1.t1.a.b.c", status: "approved" }).returning();
    const [shop2] = await db.insert(merchants).values({ ownerUserId: m2.id, name: "Shop 2", governorate: "BSR", city: "Ashar", phoneEnc: "v1.t1.a.b.c", status: "approved" }).returning();
    const { merchantMembers } = await import("@/server/db/schema");
    await db.insert(merchantMembers).values([{ merchantId: shop1!.id, userId: m1.id, role: "owner" }, { merchantId: shop2!.id, userId: m2.id, role: "owner" }]);

    await market.createOfferRequest(alice.id, { vehicleId: aliceVehicle.id, partDescription: "كويل الأسطوانة 1", quantity: 1, governorate: "BGD" });
    const seen1 = await market.openRequestsForMerchant(m1.id);
    const seen2 = await market.openRequestsForMerchant(m2.id);
    expect(seen1).toHaveLength(1);
    expect(seen2).toHaveLength(0);
    expect(JSON.stringify(seen1)).not.toContain(alice.id);
    expect(JSON.stringify(seen1)).not.toContain(aliceVehicle.id);
    expect(JSON.stringify(seen1)).not.toContain("KMHDH41");

    const p = await market.upsertProduct(m1.id, { titleAr: "كويل", brand: "Denso", category: "ignition", oeNumbers: ["27301-2B010"], condition: "new", authenticityClaim: "oem_genuine", priceMinor: 45000, currency: "IQD", stockQty: 3, warrantyDays: 30, returnDays: 7, deliveryOptions: ["pickup"], imageIds: [], fitments: [] });
    await expect(market.upsertProduct(m2.id, { titleAr: "hijack", brand: "x", category: "x", oeNumbers: [], condition: "new", authenticityClaim: "unknown", priceMinor: 1, currency: "IQD", stockQty: 1, warrantyDays: 0, returnDays: 0, deliveryOptions: ["pickup"], imageIds: [], fitments: [] }, p.id)).rejects.toMatchObject({ code: "not_found" });

    // Merchants never get access to diagnostic sessions.
    await expect(diag.getSessionDetail(m1.id, aliceSession)).rejects.toMatchObject({ code: "not_found" });
  });

  it("an unapproved merchant cannot operate", async () => {
    const u = await makeUser();
    await market.applyMerchant(u.id, { name: "Pending Parts", governorate: "BGD", city: "Bab Al-Sharqi", phone: "07700000000" });
    await expect(market.myProducts(u.id)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("workshop isolation", () => {
  it("workshops see only their own appointments, with a vehicle snapshot and no owner identity", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const w1 = await ws.applyWorkshop(owner.id, { name: "ورشة الدقة", governorate: "BGD", city: "Karrada", address: "شارع 62", phone: "07701112222", specialties: ["engine"], brands: ["Hyundai"] });
    const w2 = await ws.applyWorkshop(other.id, { name: "Other", governorate: "BGD", city: "Mansour", address: "x", phone: "07703334444", specialties: ["brakes"], brands: [] });
    const mod = await makeUser(["vehicle_owner", "moderator"], { mfa: true });
    await ws.moderateWorkshop(mod.id, w1.id, "approved");
    await ws.moderateWorkshop(mod.id, w2.id, "approved");
    const appt = await ws.bookAppointment(alice.id, { workshopId: w1.id, vehicleId: aliceVehicle.id, preferredAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), shareDiagnosticSessionId: aliceSession });
    const list1 = await ws.workshopAppointments(owner.id);
    const list2 = await ws.workshopAppointments(other.id);
    expect(list1.map((a) => a.id)).toContain(appt.id);
    expect(list2.map((a) => a.id)).not.toContain(appt.id);
    expect(JSON.stringify(list1)).not.toContain(alice.id);
    await expect(ws.setAppointmentStatus(other.id, appt.id, { status: "confirmed" })).rejects.toMatchObject({ code: "not_found" });
    await ws.setAppointmentStatus(owner.id, appt.id, { status: "confirmed" });
  });
});
