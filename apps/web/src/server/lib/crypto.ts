import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";

/**
 * Field-level authenticated encryption with AES-256-GCM (node:crypto / OpenSSL).
 *
 * Envelope: "v1.<keyId>.<iv b64url>.<ciphertext b64url>.<tag b64url>"
 * - 96-bit random IV per operation (never reused with the same key)
 * - key id stored with the data so keys can be rotated: new writes use the
 *   active key, old envelopes still decrypt while their key is in the ring,
 *   and `pnpm keys:reencrypt` rewrites them under the active key.
 * - optional AAD binds a ciphertext to its column/row so it can't be swapped.
 *
 * Passwords are NEVER encrypted with this — they are hashed with Argon2id.
 */

type KeyRing = Map<string, Buffer>;
let ring: KeyRing | undefined;

function keyRing(): KeyRing {
  if (ring) return ring;
  const r: KeyRing = new Map();
  for (const entry of env().DATA_ENCRYPTION_KEYS.split(",")) {
    const [id, b64] = entry.trim().split(":");
    if (!id || !b64) throw new Error("DATA_ENCRYPTION_KEYS entry malformed");
    const key = Buffer.from(b64, "base64");
    if (key.length !== 32) throw new Error(`Encryption key ${id} must be 32 bytes`);
    r.set(id, key);
  }
  if (!r.has(env().DATA_ENCRYPTION_ACTIVE_KEY_ID)) throw new Error("Active encryption key id not in ring");
  ring = r;
  return r;
}

export function resetKeyRing(): void {
  ring = undefined;
}

const b64u = (b: Buffer) => b.toString("base64url");
const fromB64u = (s: string) => Buffer.from(s, "base64url");

export function encryptField(plaintext: string, aad?: string): string {
  const keyId = env().DATA_ENCRYPTION_ACTIVE_KEY_ID;
  const key = keyRing().get(keyId)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", keyId, b64u(iv), b64u(ct), b64u(cipher.getAuthTag())].join(".");
}

export function decryptField(envelope: string, aad?: string): string {
  const parts = envelope.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") throw new Error("Unsupported ciphertext envelope");
  const [, keyId, iv, ct, tag] = parts as [string, string, string, string, string];
  const key = keyRing().get(keyId);
  if (!key) throw new Error(`Encryption key ${keyId} not available`);
  const decipher = createDecipheriv("aes-256-gcm", key, fromB64u(iv));
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(fromB64u(tag));
  return Buffer.concat([decipher.update(fromB64u(ct)), decipher.final()]).toString("utf8");
}

export function envelopeKeyId(envelope: string): string | undefined {
  return envelope.split(".")[1];
}

/** 160+ bits of CSPRNG entropy, URL-safe. */
export function randomToken(bytes = 32): string {
  return b64u(randomBytes(bytes));
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacB64u(key: string, data: string): string {
  return createHmac("sha256", Buffer.from(key, "base64")).update(data).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
