import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { knowledgeDocuments, learningCaseCopies } from "@/server/db/schema";
import { retrieve } from "@/server/modules/ai/rag";
import * as learning from "@/server/modules/learning/service";
import { createVehicle } from "@/server/modules/vehicles/service";
import { freshDb, makeUser } from "./support/db";

const car = { make: "Nissan", model: "Sunny", year: 2014, fuel: "petrol", transmission: "automatic", salesMarket: "GCC", odometerUnit: "km" } as const;
const caseInput = (vehicleId: string, cause: string) => ({
  vehicleId, codes: ["P0300"], symptoms: `رجفة. رقمي 07701234567 والشاصي 3N1AB7AP5EY000001 اسمي علي حسن`, measurements: [], confirmedCause: cause, confirmedBy: "mechanic" as const,
  repairPerformed: "تبديل كويلات", partsReplaced: [{ name: "coil" }], outcome: "resolved" as const, attachmentIds: [], repairDate: "2026-09-14", costMinor: 87000, currency: "IQD" as const,
});

let reviewer: Awaited<ReturnType<typeof makeUser>>;
beforeAll(async () => {
  await freshDb();
  reviewer = await makeUser(["vehicle_owner", "technical_reviewer"], { mfa: true });
});

describe("learning consent", () => {
  it("is off by default and verified cases without consent never enter the improvement copy or RAG", async () => {
    const u = await makeUser();
    expect(await learning.activeConsent(u.id)).toBeNull();
    const v = await createVehicle(u.id, { ...car, vin: "3N1AB7AP5EY000001" });
    const c = await learning.submitCase(u.id, caseInput(v.id, "كويل الأسطوانة 2 تالف"));
    await learning.reviewCase(reviewer.id, c.id, { decision: "verified", notes: "matches", evidence: [] });
    const db = await getDb();
    expect(await db.select().from(learningCaseCopies).where(eq(learningCaseCopies.sourceCaseId, c.id))).toHaveLength(0);
  });

  it("rejects consent for an outdated text version", async () => {
    const u = await makeUser();
    await expect(learning.setConsent(u.id, true, "old-version", ["repair_cases"])).rejects.toMatchObject({ code: "conflict" });
  });

  it("with consent, a verified case is de-identified and becomes retrievable; withdrawal removes it", async () => {
    const u = await makeUser();
    await learning.setConsent(u.id, true, learning.CONSENT_TEXT_VERSION, ["repair_cases"]);
    const v = await createVehicle(u.id, { ...car, vin: "3N1AB7AP5EY000001" });
    const c = await learning.submitCase(u.id, caseInput(v.id, "كويل الأسطوانة 3 تالف"));
    await learning.reviewCase(reviewer.id, c.id, { decision: "verified", notes: "ok", evidence: ["mechanic invoice"] });
    const db = await getDb();
    const [copy] = await db.select().from(learningCaseCopies).where(eq(learningCaseCopies.sourceCaseId, c.id));
    const payload = JSON.stringify(copy!.payload);
    expect(payload).not.toContain("07701234567");
    expect(payload).not.toContain("3N1AB7AP5EY000001");
    expect(payload).not.toContain("علي حسن");
    expect(payload).toContain("2026-09");
    expect(payload).not.toContain("2026-09-14");
    expect((copy!.payload as { costBucket: { approx: number } }).costBucket.approx % 5000).toBe(0);

    const before = await retrieve({ codes: ["P0300"], symptoms: "", make: "Nissan", year: 2014 });
    expect(before.chunks.some((ch) => ch.kind === "verified_case")).toBe(true);

    await learning.withdrawConsent(u.id);
    expect(await db.select().from(learningCaseCopies).where(eq(learningCaseCopies.sourceCaseId, c.id))).toHaveLength(0);
    const after = await retrieve({ codes: ["P0300"], symptoms: "", make: "Nissan", year: 2014 });
    expect(after.chunks.some((ch) => ch.kind === "verified_case")).toBe(false);
    const docs = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.kind, "verified_case"));
    expect(docs.every((d) => !d.ragAllowed)).toBe(true);
  });

  it("unreviewed submissions never reach the knowledge base", async () => {
    const u = await makeUser();
    await learning.setConsent(u.id, true, learning.CONSENT_TEXT_VERSION, ["repair_cases"]);
    const v = await createVehicle(u.id, car);
    const c = await learning.submitCase(u.id, caseInput(v.id, "unverified claim"));
    const db = await getDb();
    expect(await db.select().from(learningCaseCopies).where(eq(learningCaseCopies.sourceCaseId, c.id))).toHaveLength(0);
    await expect(learning.reviewCase(reviewer.id, (await learning.submitCase(u.id, { ...caseInput(v.id, ""), confirmedCause: undefined })).id, { decision: "verified", notes: "x", evidence: [] })).rejects.toMatchObject({ code: "conflict" });
  });

  it("flags duplicates and coordinated submissions for review", async () => {
    const u = await makeUser();
    const v = await createVehicle(u.id, car);
    await learning.submitCase(u.id, caseInput(v.id, "same cause"));
    const dup = await learning.submitCase(u.id, caseInput(v.id, "same cause"));
    expect(dup.flags).toContain("duplicate_of_own_case");
    expect(dup.status).toBe("needs_review");
  });
});

describe("datasets & model registry", () => {
  it("builds group-consistent splits from eligible copies and exports only approved datasets", async () => {
    const admin = await makeUser(["vehicle_owner", "sysadmin"], { mfa: true });
    for (let i = 0; i < 6; i++) {
      const u = await makeUser();
      await learning.setConsent(u.id, true, learning.CONSENT_TEXT_VERSION, ["repair_cases"]);
      const v = await createVehicle(u.id, { ...car, model: i % 2 ? "Sunny" : "Sentra" });
      const c = await learning.submitCase(u.id, caseInput(v.id, `cause group ${i % 2}`));
      await learning.reviewCase(reviewer.id, c.id, { decision: "verified", notes: "ok", evidence: [] });
    }
    const ds = await learning.buildDataset(admin.id, "ds-test");
    const db = await getDb();
    const copies = await db.select().from(learningCaseCopies);
    const group = new Map(copies.map((c) => [c.id, c.groupKey]));
    const trainGroups = new Set(ds.manifest.train.map((id) => group.get(id)));
    for (const id of ds.manifest.test) expect(trainGroups.has(group.get(id))).toBe(false);
    await expect(learning.exportDataset(ds.id)).rejects.toMatchObject({ code: "conflict" });
    await learning.approveDataset(admin.id, ds.id);
    const jsonl = await learning.exportDataset(ds.id);
    expect(jsonl.split("\n").length).toBe(ds.caseCount);
    expect(jsonl).not.toMatch(/user|email|vin/i);
  });

  it("cannot activate a model without approval and an evaluation run", async () => {
    const admin = await makeUser(["vehicle_owner", "sysadmin"], { mfa: true });
    const m = await learning.registerModel(admin.id, { name: "qwen3:8b-test", baseModel: "qwen3:8b", license: "Apache-2.0" });
    await expect(learning.setModelStatus(admin.id, m.id, "active")).rejects.toMatchObject({ code: "conflict" });
    await learning.setModelStatus(admin.id, m.id, "approved");
    await expect(learning.setModelStatus(admin.id, m.id, "active")).rejects.toMatchObject({ message: "evaluation_required" });
  });
});
