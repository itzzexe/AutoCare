import { NextResponse, type NextRequest } from "next/server";

/**
 * Request-time security layer (Next.js 16 "proxy", formerly middleware):
 *  - HTTPS enforcement in production (behind the TLS-terminating reverse proxy)
 *  - per-request CSP nonce with strict-dynamic (no 'unsafe-inline' scripts)
 *  - HSTS only when explicitly enabled after the domain/TLS setup is verified
 *  - CORS for /api/v1 with an explicit per-environment allow-list (never "*")
 * Reads process.env directly because it runs outside the server module graph.
 */

const isProd = () => process.env.APP_ENV === "production" || process.env.APP_ENV === "staging";
const appOrigin = () => new URL(process.env.APP_ORIGIN ?? "http://localhost:3000").origin;
const corsAllow = () => new Set([appOrigin(), ...(process.env.CORS_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)]);

function csp(nonce: string): string {
  const dev = !isProd();
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Dev overlay injects inline styles; production allows only our nonce'd/self styles.
    `style-src 'self' ${dev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function applyCors(req: NextRequest, res: NextResponse) {
  const origin = req.headers.get("origin");
  if (origin && corsAllow().has(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Vary", "Origin");
  }
  return res;
}

export function proxy(req: NextRequest) {
  // 1. HTTPS everywhere in production. The reverse proxy also redirects port 80.
  if (isProd() && req.headers.get("x-forwarded-proto") === "http") {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }

  const isApi = req.nextUrl.pathname.startsWith("/api/");
  if (isApi) {
    if (req.method === "OPTIONS") {
      const origin = req.headers.get("origin");
      if (!origin || !corsAllow().has(origin)) return new NextResponse(null, { status: 403 });
      const res = new NextResponse(null, { status: 204 });
      res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE");
      res.headers.set("Access-Control-Allow-Headers", "content-type,x-csrf-token,idempotency-key,authorization");
      res.headers.set("Access-Control-Max-Age", "600");
      return applyCors(req, res);
    }
    const res = applyCors(req, NextResponse.next());
    res.headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    if (isProd() && process.env.HSTS_ENABLED === "true") res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    return res;
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = csp(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", policy);
  if (isProd() && process.env.HSTS_ENABLED === "true") res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icons/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
