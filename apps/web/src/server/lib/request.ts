import "server-only";
import { isIP } from "node:net";
import { env } from "../config/env";

/**
 * Client IP resolution. Only the last TRUSTED_PROXY_HOPS entries of
 * X-Forwarded-For were written by our own reverse proxy; anything to the left
 * is client-controlled and ignored.
 */
export function clientIp(headers: Headers): string {
  const hops = env().TRUSTED_PROXY_HOPS;
  const xff = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // With 0 hops the right-most value is what the Next.js server itself saw on the socket.
  const idx = hops === 0 ? xff.length - 1 : xff.length - hops;
  const candidate = xff[idx] ?? "";
  return isIP(candidate) ? candidate : "unknown";
}

/** Coarse prefix (/24 or /48) stored for security review instead of full IPs. */
export function ipPrefix(ip: string): string | null {
  if (isIP(ip) === 4) return ip.split(".").slice(0, 3).join(".") + ".0/24";
  if (isIP(ip) === 6) return ip.split(":").slice(0, 3).join(":") + "::/48";
  return null;
}

export function sameOriginRequest(headers: Headers): boolean {
  const allowed = new Set([new URL(env().APP_ORIGIN).origin, ...env().CORS_ALLOWED_ORIGINS]);
  const origin = headers.get("origin");
  if (origin) return allowed.has(origin);
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const referer = headers.get("referer");
  if (referer) {
    try {
      return allowed.has(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  // No Origin, no Sec-Fetch-Site, no Referer: not a browser-initiated cross-site request.
  return true;
}
