import "server-only";
import { hash, verify } from "@node-rs/argon2";

/** Algorithm.Argon2id (the binding exports it as a const enum, unusable with isolatedModules). */
const ARGON2ID = 2;

/**
 * Argon2id password hashing (@node-rs/argon2, a binding of the reference
 * implementation). Parameters follow the OWASP Password Storage Cheat Sheet
 * minimum (m=19 MiB, t=2, p=1); `pnpm bench:argon2` measures them on the
 * target server so they can be raised if latency allows. The salt is random
 * per hash and encoded in the PHC string together with the parameters, so
 * old hashes keep verifying after a parameter change and are upgraded on login.
 */
export const ARGON2_PARAMS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_PARAMS);
}

export async function verifyPassword(phc: string, password: string): Promise<boolean> {
  try {
    return await verify(phc, password);
  } catch {
    return false;
  }
}

/** True when the stored hash was made with weaker/different parameters. */
export function needsRehash(phc: string): boolean {
  const m = /\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(phc);
  if (!m) return true;
  return Number(m[1]) < ARGON2_PARAMS.memoryCost || Number(m[2]) < ARGON2_PARAMS.timeCost;
}

/** A precomputed hash used to equalise timing when the account does not exist. */
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword("timing-equaliser-not-a-real-password");
  return dummy;
}

/** Very small local blocklist; complemented by length >= 12 (ASVS V2.1.1). */
const COMMON = new Set([
  "123456789012", "password1234", "qwertyuiop12", "iloveyou1234", "000000000000", "111111111111",
  "aaaaaaaaaaaa", "passwordpassword", "123123123123", "abc123abc123",
]);
export function isTooCommon(password: string): boolean {
  const p = password.toLowerCase();
  return COMMON.has(p) || /^(.)\1+$/.test(p);
}
