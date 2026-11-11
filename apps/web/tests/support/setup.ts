import { randomBytes } from "node:crypto";

/**
 * Test environment. Every test file gets a fresh in-memory PGlite database
 * (real PostgreSQL semantics, incl. pgvector) via tests/support/db.ts.
 * Random keys per run: nothing here is a real secret.
 */
const b64 = (n: number) => randomBytes(n).toString("base64");
Object.assign(process.env, {
  APP_ENV: "test",
  APP_ORIGIN: "http://localhost:3000",
  TRUSTED_PROXY_HOPS: "0",
  CSRF_SECRET: b64(32),
  FILE_URL_SECRET: b64(32),
  DATA_ENCRYPTION_KEYS: `t1:${b64(32)}`,
  DATA_ENCRYPTION_ACTIVE_KEY_ID: "t1",
  AI_MODE: "disabled",
  ENABLE_MOCK_PROVIDERS: "true",
  PROVIDER_NHTSA_ENABLED: "false",
  PAYMENT_TEST_WEBHOOK_SECRET: b64(32),
  STORAGE_LOCAL_DIR: `.data/test-uploads-${process.pid}`,
  LOG_LEVEL: "fatal",
});
// TEST_DATABASE_URL runs the same suite against a real PostgreSQL server (CI job "postgres-integration").
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
// TEST_REDIS_URL exercises the shared Redis rate-limit store instead of the in-process fallback.
if (process.env.TEST_REDIS_URL) process.env.REDIS_URL = process.env.TEST_REDIS_URL;
else delete process.env.REDIS_URL;
delete process.env.CLAMAV_HOST;
