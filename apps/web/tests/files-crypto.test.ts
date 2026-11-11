import { rmSync } from "node:fs";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as uploadRoute } from "@/app/api/v1/uploads/route";
import { resetEnvCache } from "@/server/config/env";
import { decryptField, encryptField, resetKeyRing } from "@/server/lib/crypto";
import { scrub } from "@/server/lib/logger";
import { readSignedFile, signedFileUrl, storeUpload } from "@/server/modules/files/service";
import { freshDb, json, makeUser, params, req } from "./support/db";

beforeAll(async () => {
  await freshDb();
});
afterAll(() => rmSync(process.env.STORAGE_LOCAL_DIR!, { recursive: true, force: true }));

async function jpegWithExif() {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: "#d9480f" } })
    .jpeg()
    .withExif({ IFD0: { Make: "SecretPhone", Copyright: "GPS 33.3152N 44.3661E" } })
    .toBuffer();
}

describe("file upload security", () => {
  it("decides type from magic bytes: HTML or SVG renamed as an image is rejected", async () => {
    const u = await makeUser();
    await expect(storeUpload(u.id, "case_attachment", Buffer.from("<html><script>alert(1)</script></html>"))).rejects.toMatchObject({ code: "unsupported_media_type" });
    await expect(storeUpload(u.id, "case_attachment", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'))).rejects.toMatchObject({ code: "unsupported_media_type" });
    const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    await expect(storeUpload(u.id, "case_attachment", zipHeader)).rejects.toMatchObject({ code: "unsupported_media_type" });
  });

  it("keeps files quarantined (not served) when no malware scanner is configured", async () => {
    const u = await makeUser();
    const r = await storeUpload(u.id, "case_attachment", await jpegWithExif());
    expect(r.status).toBe("scan_unavailable");
    const exp = Math.floor(Date.now() / 1000) + 60;
    const url = new URL(signedFileUrl(r.id, u.id, 60), "http://x");
    await expect(readSignedFile(r.id, u.id, exp, url.searchParams.get("sig")!)).rejects.toMatchObject({ code: "not_found" });
  });

  it("with a clean scan: re-encodes images (EXIF gone), and signed URLs are viewer-bound and expiring", async () => {
    // Minimal clamd stand-in answering "stream: OK".
    const net = await import("node:net");
    const srv = net.createServer((s) => {
      s.on("data", (d) => {
        if (d.subarray(-4).equals(Buffer.alloc(4))) s.end("stream: OK\0");
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    process.env.CLAMAV_HOST = "127.0.0.1";
    process.env.CLAMAV_PORT = String((srv.address() as import("node:net").AddressInfo).port);
    resetEnvCache();
    try {
      const owner = await makeUser();
      const other = await makeUser();
      const r = await storeUpload(owner.id, "case_attachment", await jpegWithExif());
      expect(r.status).toBe("clean");
      const sig = new URL(signedFileUrl(r.id, owner.id, 60), "http://x").searchParams;
      const exp = Number(sig.get("exp"));
      const f = await readSignedFile(r.id, owner.id, exp, sig.get("sig")!);
      expect(f.mime).toBe("image/webp");
      const meta = await sharp(f.data).metadata();
      expect(meta.exif).toBeUndefined();
      expect(f.data.includes(Buffer.from("SecretPhone"))).toBe(false);

      await expect(readSignedFile(r.id, other.id, exp, sig.get("sig")!)).rejects.toMatchObject({ code: "not_found" });
      const otherSig = new URL(signedFileUrl(r.id, other.id, 60), "http://x").searchParams.get("sig")!;
      await expect(readSignedFile(r.id, other.id, exp, otherSig)).rejects.toMatchObject({ code: "not_found" });
      await expect(readSignedFile(r.id, owner.id, Math.floor(Date.now() / 1000) - 1, sig.get("sig")!)).rejects.toMatchObject({ code: "not_found" });
      await expect(readSignedFile(r.id, owner.id, exp, sig.get("sig")!.slice(0, -2) + "AA")).rejects.toMatchObject({ code: "not_found" });
    } finally {
      delete process.env.CLAMAV_HOST;
      resetEnvCache();
      srv.close();
    }
  });

  it("upload endpoint needs auth + CSRF and enforces the size cap", async () => {
    expect((await uploadRoute(req("POST", "/api/v1/uploads?purpose=case_attachment", { raw: Buffer.from("x") }), params())).status).toBe(401);
    const u = await makeUser();
    expect((await uploadRoute(req("POST", "/api/v1/uploads?purpose=case_attachment", { user: u, raw: Buffer.from("x"), csrf: null }), params())).status).toBe(403);
    const big = await json(await uploadRoute(req("POST", "/api/v1/uploads?purpose=case_attachment", { user: u, raw: Buffer.alloc(9 * 1024 * 1024) }), params()));
    expect(big.status).toBe(413);
  });
});

describe("field encryption (AES-256-GCM) and rotation", () => {
  it("round-trips, uses a fresh nonce per encryption, and detects tampering or wrong context", () => {
    const a = encryptField("1HGCM82633A004352", "vehicle:1:vin");
    const b = encryptField("1HGCM82633A004352", "vehicle:1:vin");
    expect(a).not.toBe(b);
    expect(decryptField(a, "vehicle:1:vin")).toBe("1HGCM82633A004352");
    expect(() => decryptField(a, "vehicle:2:vin")).toThrow();
    const parts = a.split(".");
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith("A") ? "BB" : "AA");
    expect(() => decryptField(parts.join("."), "vehicle:1:vin")).toThrow();
  });

  it("decrypts old envelopes after the active key changes", () => {
    const old = encryptField("secret", "ctx");
    const prevKeys = process.env.DATA_ENCRYPTION_KEYS!;
    process.env.DATA_ENCRYPTION_KEYS = `${prevKeys},t2:${Buffer.alloc(32, 7).toString("base64")}`;
    process.env.DATA_ENCRYPTION_ACTIVE_KEY_ID = "t2";
    resetEnvCache();
    resetKeyRing();
    try {
      const fresh = encryptField("secret", "ctx");
      expect(fresh.split(".")[1]).toBe("t2");
      expect(decryptField(old, "ctx")).toBe("secret");
    } finally {
      process.env.DATA_ENCRYPTION_KEYS = prevKeys;
      process.env.DATA_ENCRYPTION_ACTIVE_KEY_ID = "t1";
      resetEnvCache();
      resetKeyRing();
    }
  });
});

describe("log redaction", () => {
  it("masks VINs, phone numbers, e-mails and bearer tokens in free text", () => {
    const out = scrub("vin 1HGCM82633A004352 phone 07701234567 mail ali.hassan@example.iq Authorization: Bearer abc.def.ghi");
    expect(out).not.toContain("1HGCM82633A004352");
    expect(out).not.toContain("07701234567");
    expect(out).not.toContain("ali.hassan@");
    expect(out).not.toContain("abc.def.ghi");
  });
});
