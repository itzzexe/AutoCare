import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { GET as meRoute } from "@/app/api/v1/auth/me/route";
import { POST as mobileLogin } from "@/app/api/v1/auth/mobile/login/route";
import { POST as createVehicle, GET as listVehiclesRoute } from "@/app/api/v1/vehicles/route";
import { POST as webhook } from "@/app/api/v1/webhooks/test-payment/route";
import { GET as searchRoute } from "@/app/api/v1/search/route";
import { proxy } from "@/proxy";
import { NextRequest } from "next/server";
import { PASSWORD, freshDb, json, makeUser, params, req } from "./support/db";

const car = { make: "Toyota", model: "Camry", year: 2015, fuel: "petrol", transmission: "automatic", salesMarket: "GCC", odometerUnit: "km" };

beforeAll(async () => {
  await freshDb();
});

describe("CSRF & origin", () => {
  it("accepts a same-origin request with the signed token", async () => {
    const u = await makeUser();
    expect((await createVehicle(req("POST", "/api/v1/vehicles", { user: u, body: car }), params())).status).toBe(200);
  });

  it("rejects a cookie-authenticated POST without the CSRF header", async () => {
    const u = await makeUser();
    const r = await json(await createVehicle(req("POST", "/api/v1/vehicles", { user: u, body: car, csrf: null }), params()));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("csrf_failed");
  });

  it("rejects a token bound to a different session (no cross-session reuse)", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const r = await json(await createVehicle(req("POST", "/api/v1/vehicles", { user: a, body: car, csrf: b.csrf }), params()));
    expect(r.status).toBe(403);
  });

  it("rejects a cross-site Origin even with a valid token", async () => {
    const u = await makeUser();
    const r = await json(await createVehicle(req("POST", "/api/v1/vehicles", { user: u, body: car, origin: "https://evil.example" }), params()));
    expect(r.status).toBe(403);
    expect(r.body.error.message).toBe("origin_mismatch");
  });

  it("rejects text/plain bodies that a cross-site form could send", async () => {
    const u = await makeUser();
    const r = await json(await createVehicle(req("POST", "/api/v1/vehicles", { user: u, body: car, headers: { "content-type": "text/plain" } }), params()));
    expect(r.status).toBe(415);
  });

  it("does not require CSRF for signature-authenticated webhooks, but still requires the signature", async () => {
    const r = await json(await webhook(req("POST", "/api/v1/webhooks/test-payment", { raw: '{"id":"e1"}', csrf: null, origin: null }), params()));
    expect(r.status).toBe(403);
    expect(r.body.error.message).toBe("bad_signature");
  });
});

describe("input validation", () => {
  it("rejects unknown fields (strict schemas) and reports field errors", async () => {
    const u = await makeUser();
    const r = await json(await createVehicle(req("POST", "/api/v1/vehicles", { user: u, body: { ...car, ownerId: "00000000-0000-0000-0000-000000000000" } }), params()));
    expect(r.status).toBe(422);
  });

  it("rejects oversized bodies with 413", async () => {
    const u = await makeUser();
    const r = await createVehicle(req("POST", "/api/v1/vehicles", { user: u, raw: JSON.stringify({ ...car, nickname: "x".repeat(70_000) }), headers: { "content-type": "application/json" } }), params());
    expect(r.status).toBe(413);
  });

  it("rejects malformed VINs and malformed JSON", async () => {
    const u = await makeUser();
    expect((await createVehicle(req("POST", "/api/v1/vehicles", { user: u, body: { ...car, vin: "IOQ12345678901234" } }), params())).status).toBe(422);
    expect((await createVehicle(req("POST", "/api/v1/vehicles", { user: u, raw: "{not json", headers: { "content-type": "application/json" } }), params())).status).toBe(400);
  });

  it("treats SQL-looking search input as plain data", async () => {
    const r = await json(await searchRoute(req("GET", "/api/v1/search?q=" + encodeURIComponent("'; DROP TABLE users; --")), params()));
    expect(r.status).toBe(200);
    const again = await json(await searchRoute(req("GET", "/api/v1/search?q=P0300"), params()));
    expect(again.body.code.parsed.code).toBe("P0300");
  });
});

describe("errors and auth surfaces", () => {
  it("returns a generic error envelope without stack traces", async () => {
    const r = await json(await listVehiclesRoute(req("GET", "/api/v1/vehicles"), params()));
    expect(r.status).toBe(401);
    expect(Object.keys(r.body.error).sort()).toEqual(["code", "message", "requestId"]);
    expect(JSON.stringify(r.body)).not.toMatch(/at \w+ \(|node_modules/);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("only accepts bearer tokens issued to native clients", async () => {
    const web = await makeUser();
    const asBearer = await json(await meRoute(req("GET", "/api/v1/auth/me", { headers: { authorization: `Bearer ${web.token}` }, csrf: null }), params()));
    expect(asBearer.body.user).toBeNull();
    const m = await json(await mobileLogin(req("POST", "/api/v1/auth/mobile/login", { body: { email: web.email, password: PASSWORD }, csrf: null, origin: null }), params()));
    expect(m.status).toBe(200);
    const me = await json(await meRoute(req("GET", "/api/v1/auth/me", { headers: { authorization: `Bearer ${m.body.token}` }, csrf: null }), params()));
    expect(me.body.user.id).toBe(web.id);
  });
});

describe("security headers, CSP and CORS (proxy + next.config)", () => {
  it("sets a nonce-based CSP without unsafe-inline scripts", async () => {
    const res = proxy(new NextRequest("http://localhost:3000/"));
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("answers CORS preflight only for allow-listed origins and never with '*'", async () => {
    const bad = proxy(new NextRequest("http://localhost:3000/api/v1/vehicles", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
    expect(bad.status).toBe(403);
    const good = proxy(new NextRequest("http://localhost:3000/api/v1/vehicles", { method: "OPTIONS", headers: { origin: "http://localhost:3000" } }));
    expect(good.status).toBe(204);
    expect(good.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });

  it("redirects HTTP to HTTPS in production", async () => {
    const prev = process.env.APP_ENV;
    process.env.APP_ENV = "production";
    try {
      const res = proxy(new NextRequest("http://app.example/garage", { headers: { "x-forwarded-proto": "http" } }));
      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toMatch(/^https:/);
    } finally {
      process.env.APP_ENV = prev;
    }
  });

  it("declares nosniff, referrer, frame and permissions policies globally", () => {
    const cfg = readFileSync("next.config.ts", "utf8");
    for (const h of ["X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy"]) expect(cfg).toContain(h);
  });
});

describe("secrets never reach the client bundle", () => {
  it("never reads NEXT_PUBLIC_* variables (which would be inlined into the browser bundle)", () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const offenders = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && /process\.env\.NEXT_PUBLIC_/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("keeps provider credentials out of client components", () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const clientFiles = walk("src").filter((f) => /\.tsx?$/.test(f) && readFileSync(f, "utf8").startsWith('"use client"'));
    for (const f of clientFiles) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/PROVIDER_|_SECRET|DATA_ENCRYPTION|from "@\/server\/(config|lib\/crypto|db)/);
    }
  });
});
