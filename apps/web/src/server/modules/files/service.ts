import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { Socket } from "node:net";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { env } from "../../config/env";
import { getDb } from "../../db/client";
import { uploads } from "../../db/schema";
import { hmacB64u, safeEqual } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { audit } from "../audit/audit";

/**
 * Upload pipeline (OWASP File Upload Cheat Sheet):
 *  1. size cap before parsing; content type from MAGIC BYTES (file-type), not
 *     the extension or client MIME; allow-list JPEG/PNG/WebP/PDF only
 *     (no SVG, HTML, archives)
 *  2. stored under a random key in a private directory outside the web root,
 *     first in quarantine/
 *  3. malware scan with ClamAV (clamd INSTREAM). If no scanner is configured
 *     or it fails, the file stays unavailable ("scan_unavailable") — never
 *     treated as safe.
 *  4. images are re-encoded with sharp (drops EXIF/GPS and any trailing data),
 *     with pixel-count limits against decompression bombs
 *  5. PDFs are never rendered or parsed server-side in this release; they are
 *     only stored and served as attachments after a clean scan
 *  6. served only to the owner (or an authorised party) through short-lived
 *     HMAC-signed URLs with Content-Disposition: attachment for PDFs
 */

const ALLOWED = new Map<string, "image" | "pdf">([
  ["image/jpeg", "image"],
  ["image/png", "image"],
  ["image/webp", "image"],
  ["application/pdf", "pdf"],
]);
const MAX_PIXELS = 40_000_000;
const MAX_DIMENSION = 8000;
type Purpose = "case_attachment" | "product_image" | "merchant_document";

const root = () => path.resolve(env().STORAGE_LOCAL_DIR);
const pathFor = (key: string, area: "quarantine" | "clean") => {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("invalid storage key");
  return path.join(root(), area, key);
};

async function clamScan(buf: Buffer): Promise<"clean" | "infected" | "unavailable"> {
  const host = env().CLAMAV_HOST;
  if (!host) return "unavailable";
  return new Promise((resolve) => {
    const sock = new Socket();
    let reply = "";
    const done = (r: "clean" | "infected" | "unavailable") => {
      sock.destroy();
      resolve(r);
    };
    sock.setTimeout(20_000, () => done("unavailable"));
    sock.on("error", () => done("unavailable"));
    sock.on("data", (d) => (reply += d.toString()));
    sock.on("end", () => done(/OK\0?$/.test(reply.trim()) ? "clean" : /FOUND/.test(reply) ? "infected" : "unavailable"));
    sock.connect(env().CLAMAV_PORT, host, () => {
      sock.write("zINSTREAM\0");
      for (let i = 0; i < buf.length; i += 64 * 1024) {
        const chunk = buf.subarray(i, i + 64 * 1024);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        sock.write(len);
        sock.write(chunk);
      }
      sock.write(Buffer.alloc(4));
    });
  });
}

export async function storeUpload(userId: string, purpose: Purpose, data: Buffer, requestId?: string) {
  if (data.length === 0) throw new AppError("bad_request", "empty_file");
  if (data.length > env().UPLOAD_MAX_BYTES) throw new AppError("payload_too_large");
  const ft = await fileTypeFromBuffer(data);
  const kind = ft ? ALLOWED.get(ft.mime) : undefined;
  if (!ft || !kind || (purpose === "product_image" && kind !== "image")) {
    await audit({ action: "upload.rejected", actorUserId: userId, requestId, meta: { detected: ft?.mime ?? "unknown", purpose } });
    throw new AppError("unsupported_media_type");
  }

  const db = await getDb();
  const id = randomUUID();
  const key = randomUUID();
  await mkdir(path.join(root(), "quarantine"), { recursive: true });
  await mkdir(path.join(root(), "clean"), { recursive: true });
  await writeFile(pathFor(key, "quarantine"), data, { mode: 0o600 });
  await db.insert(uploads).values({ id, ownerId: userId, purpose, storageKey: key, detectedMime: ft.mime, sizeBytes: data.length, sha256: createHash("sha256").update(data).digest("hex"), status: "quarantined" });

  let width: number | null = null;
  let height: number | null = null;
  let output = data;
  try {
    if (kind === "image") {
      const meta = await sharp(data, { limitInputPixels: MAX_PIXELS }).metadata();
      if (!meta.width || !meta.height || meta.width > MAX_DIMENSION || meta.height > MAX_DIMENSION) throw new AppError("unsupported_media_type", "image_dimensions");
      // Re-encode: strips EXIF/GPS/ICC extras and any appended payload.
      output = await sharp(data, { limitInputPixels: MAX_PIXELS }).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      const m2 = await sharp(output).metadata();
      width = m2.width ?? null;
      height = m2.height ?? null;
    }
  } catch (e) {
    await db.update(uploads).set({ status: "rejected", statusReason: "decode_failed" }).where(eq(uploads.id, id));
    await rm(pathFor(key, "quarantine"), { force: true });
    if (e instanceof AppError) throw e;
    throw new AppError("unsupported_media_type", "decode_failed");
  }

  const scan = await clamScan(output);
  if (scan === "infected") {
    await db.update(uploads).set({ status: "infected", scanEngine: "clamav", scannedAt: new Date() }).where(eq(uploads.id, id));
    await rm(pathFor(key, "quarantine"), { force: true });
    await audit({ action: "upload.rejected", actorUserId: userId, targetKind: "upload", targetId: id, requestId, meta: { reason: "infected" } });
    throw new AppError("unsupported_media_type", "malware_detected");
  }
  if (scan === "unavailable") {
    await db.update(uploads).set({ status: "scan_unavailable", statusReason: env().CLAMAV_HOST ? "scanner_error" : "scanner_not_configured" }).where(eq(uploads.id, id));
    logger.warn({ uploadId: id }, "upload held in quarantine: scanner unavailable");
    return { id, status: "scan_unavailable" as const, mime: kind === "image" ? "image/webp" : ft.mime };
  }
  await writeFile(pathFor(key, "clean"), output, { mode: 0o600 });
  await rm(pathFor(key, "quarantine"), { force: true });
  await db
    .update(uploads)
    .set({ status: "clean", detectedMime: kind === "image" ? "image/webp" : ft.mime, sizeBytes: output.length, width, height, scanEngine: "clamav", scannedAt: new Date() })
    .where(eq(uploads.id, id));
  return { id, status: "clean" as const, mime: kind === "image" ? "image/webp" : ft.mime };
}

/** Re-run scanning for files held because the scanner was unavailable. */
export async function rescanQuarantined(): Promise<{ cleaned: number; stillHeld: number }> {
  const db = await getDb();
  const held = await db.select().from(uploads).where(eq(uploads.status, "scan_unavailable")).limit(200);
  let cleaned = 0;
  for (const u of held) {
    const buf = await readFile(pathFor(u.storageKey, "quarantine")).catch(() => null);
    if (!buf) continue;
    let out = buf;
    if (u.detectedMime.startsWith("image/") && u.detectedMime !== "image/webp") out = await sharp(buf, { limitInputPixels: MAX_PIXELS }).rotate().webp({ quality: 82 }).toBuffer();
    const r = await clamScan(out);
    if (r === "clean") {
      await writeFile(pathFor(u.storageKey, "clean"), out, { mode: 0o600 });
      await rm(pathFor(u.storageKey, "quarantine"), { force: true });
      await db.update(uploads).set({ status: "clean", scanEngine: "clamav", scannedAt: new Date(), detectedMime: u.detectedMime.startsWith("image/") ? "image/webp" : u.detectedMime }).where(eq(uploads.id, u.id));
      cleaned++;
    } else if (r === "infected") {
      await rm(pathFor(u.storageKey, "quarantine"), { force: true });
      await db.update(uploads).set({ status: "infected", scanEngine: "clamav", scannedAt: new Date() }).where(eq(uploads.id, u.id));
    }
  }
  return { cleaned, stillHeld: held.length - cleaned };
}

// ---------------- signed short-lived URLs ----------------

export function signedFileUrl(uploadId: string, viewerId: string, ttlSeconds = 300): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = hmacB64u(env().FILE_URL_SECRET, `${uploadId}:${viewerId}:${exp}`);
  return `/api/v1/files/${uploadId}?exp=${exp}&sig=${sig}`;
}

/**
 * Serve a file. The signature binds upload id + viewer + expiry, and the
 * viewer must ALSO be authorised now (owner, or public product image).
 */
export async function readSignedFile(uploadId: string, viewerId: string | null, exp: number, sig: string) {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) throw new AppError("not_found");
  const db = await getDb();
  const [u] = await db.select().from(uploads).where(and(eq(uploads.id, uploadId), eq(uploads.status, "clean"))).limit(1);
  if (!u) throw new AppError("not_found");
  const publicImage = u.purpose === "product_image";
  const binding = publicImage ? "public" : viewerId;
  if (!binding || !safeEqual(sig, hmacB64u(env().FILE_URL_SECRET, `${uploadId}:${binding}:${exp}`))) throw new AppError("not_found");
  if (!publicImage && u.ownerId !== viewerId) throw new AppError("not_found");
  const data = await readFile(pathFor(u.storageKey, "clean"));
  return { data, mime: u.detectedMime, attachment: u.detectedMime === "application/pdf" };
}

export function publicImageUrl(uploadId: string, ttlSeconds = 3600): string {
  return signedFileUrl(uploadId, "public", ttlSeconds);
}

export async function myUploads(userId: string) {
  const db = await getDb();
  const rows = await db.select().from(uploads).where(eq(uploads.ownerId, userId)).limit(100);
  return rows.map((u) => ({ id: u.id, purpose: u.purpose, status: u.status, mime: u.detectedMime, sizeBytes: u.sizeBytes, createdAt: u.createdAt, url: u.status === "clean" ? signedFileUrl(u.id, userId) : null }));
}
