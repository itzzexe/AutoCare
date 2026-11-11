import { beforeAll, describe, expect, it } from "vitest";
import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { GET as searchRoute } from "@/app/api/v1/search/route";
import { resetEnvCache } from "@/server/config/env";
import { resetLimitersForTests } from "@/server/lib/rate-limit";
import { freshDb, json, makeUser, params, req, PASSWORD } from "./support/db";

/** Redis unreachable: sensitive operations fail closed, read-only search keeps working. */
describe("rate limiter store outage", () => {
  beforeAll(async () => {
    await freshDb();
    process.env.REDIS_URL = "redis://127.0.0.1:9";
    resetEnvCache();
    resetLimitersForTests();
  });

  it("refuses logins (429 limiter_unavailable) instead of allowing unlimited attempts", async () => {
    const u = await makeUser();
    const r = await json(await loginRoute(req("POST", "/api/v1/auth/login", { body: { email: u.email, password: PASSWORD } }), params()));
    expect(r.status).toBe(429);
    expect(r.body.error.message).toBe("limiter_unavailable");
  });

  it("keeps search available through the per-instance fallback", async () => {
    const r = await searchRoute(req("GET", "/api/v1/search?q=P0300"), params());
    expect(r.status).toBe(200);
  });
});
