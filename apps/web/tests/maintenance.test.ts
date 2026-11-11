import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import * as maint from "@/server/modules/maintenance/service";
import { createVehicle } from "@/server/modules/vehicles/service";
import { freshDb, makeUser } from "./support/db";

const car = { make: "Toyota", model: "Hilux", year: 2015, fuel: "diesel", transmission: "manual", salesMarket: "GCC", odometerUnit: "km", odometer: 200_000 } as const;

beforeAll(async () => {
  await freshDb();
});

describe("maintenance log & reminders", () => {
  it("records service history and raises the vehicle odometer, never lowers it", async () => {
    const u = await makeUser();
    const v = await createVehicle(u.id, car);
    await maint.addRecord(u.id, v.id, { kind: "تبديل دهن", performedAt: "2026-09-01", odometer: 205_000 });
    await maint.addRecord(u.id, v.id, { kind: "old record", performedAt: "2025-01-01", odometer: 150_000 });
    const recs = await maint.listRecords(u.id, v.id);
    expect(recs.map((r) => r.kind)).toEqual(["تبديل دهن", "old record"]);
    const { getOwnedVehicle } = await import("@/server/modules/vehicles/service");
    expect((await getOwnedVehicle(u.id, v.id)).odometer).toBe(205_000);
  });

  it("notifies once when a reminder is due by date or by odometer; user reminders are labelled as such", async () => {
    const u = await makeUser();
    const v = await createVehicle(u.id, car);
    await maint.addReminder(u.id, v.id, { title: "date due", dueDate: "2020-01-01" });
    await maint.addReminder(u.id, v.id, { title: "odo due", dueOdometer: 199_000 });
    await maint.addReminder(u.id, v.id, { title: "not yet", dueDate: "2099-01-01", dueOdometer: 900_000 });
    expect((await maint.listReminders(u.id, v.id)).every((r) => r.origin === "user")).toBe(true);
    expect(await maint.sweepDueReminders(u.id)).toBe(2);
    expect(await maint.sweepDueReminders(u.id)).toBe(0);
    const db = await getDb();
    const n = await db.select().from(notifications).where(eq(notifications.userId, u.id));
    expect(n).toHaveLength(2);
    expect(n.every((x) => x.link?.startsWith("/garage/"))).toBe(true);
  });

  it("other users cannot read or change someone else's maintenance data", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const v = await createVehicle(a.id, car);
    const r = await maint.addReminder(a.id, v.id, { title: "x", dueDate: "2030-01-01" });
    await expect(maint.listRecords(b.id, v.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(maint.addRecord(b.id, v.id, { kind: "x", performedAt: "2026-01-01" })).rejects.toMatchObject({ code: "not_found" });
    await expect(maint.setReminderStatus(b.id, r.id, "done")).rejects.toMatchObject({ code: "not_found" });
  });
});
