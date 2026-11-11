import "server-only";
import { z } from "zod";

/**
 * Server configuration, validated once at startup. Secrets live only here,
 * never in NEXT_PUBLIC_* variables. In production the secrets are injected by
 * the platform's secret manager (see docs/DEPLOYMENT.md), not from a .env file.
 */

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");
const int = (def: number) => z.coerce.number().int().positive().default(def);
const csv = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []));

const EnvSchema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  APP_ORIGIN: z.url().default("http://localhost:3000"),
  /** Lets search engines index the PUBLIC knowledge pages. Off until the domain and legal texts are final. */
  INDEXING_ENABLED: bool,
  CORS_ALLOWED_ORIGINS: csv,
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default(".data/pglite"),
  REDIS_URL: z.string().optional(),

  /** HMAC key for CSRF tokens (>= 32 bytes, base64). */
  CSRF_SECRET: z.string().min(43),
  /** HMAC key for signed short-lived file URLs (>= 32 bytes, base64). */
  FILE_URL_SECRET: z.string().min(43),
  /** "keyId:base64key,keyId2:base64key2" — AES-256 keys for field encryption. */
  DATA_ENCRYPTION_KEYS: z.string().min(10),
  DATA_ENCRYPTION_ACTIVE_KEY_ID: z.string().min(1),

  SESSION_IDLE_MINUTES: int(60 * 24 * 3),
  SESSION_ABSOLUTE_HOURS: int(24 * 30),
  ADMIN_SESSION_IDLE_MINUTES: int(30),
  ADMIN_SESSION_ABSOLUTE_HOURS: int(12),
  REAUTH_WINDOW_MINUTES: int(10),

  AI_MODE: z.enum(["local_only", "disabled"]).default("local_only"),
  OLLAMA_URL: z.url().default("http://127.0.0.1:11434"),
  AI_MODEL: z.string().default("qwen3:8b"),
  AI_EMBED_MODEL: z.string().default("bge-m3"),
  AI_TIMEOUT_MS: int(90_000),
  AI_MAX_CONCURRENCY: int(1),
  AI_MAX_QUEUE: int(8),
  AI_NUM_CTX: int(8192),
  AI_MAX_OUTPUT_TOKENS: int(1200),
  AI_DAILY_QUOTA_PER_USER: int(30),

  PROVIDER_NHTSA_ENABLED: bool,
  PROVIDER_CARSXE_API_KEY: z.string().optional(),
  PROVIDER_AUTODATA_CLIENT_ID: z.string().optional(),
  PROVIDER_AUTODATA_CLIENT_SECRET: z.string().optional(),
  PROVIDER_TECRMI_API_KEY: z.string().optional(),
  PROVIDER_TECALLIANCE_CN_API_KEY: z.string().optional(),
  /** Test-only fixture providers. Refused in production. */
  ENABLE_MOCK_PROVIDERS: bool,
  /** Allows `pnpm db:seed:demo`. Refused in production. */
  ALLOW_DEMO_SEED: bool,

  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".data/uploads"),
  UPLOAD_MAX_BYTES: int(8 * 1024 * 1024),
  CLAMAV_HOST: z.string().optional(),
  CLAMAV_PORT: z.coerce.number().int().default(3310),

  EMAIL_PROVIDER: z.enum(["none"]).default("none"),
  PAYMENT_TEST_WEBHOOK_SECRET: z.string().optional(),
  /** Qi Card gateway. The production host is issued by the acquirer (no default). */
  QI_API_BASE: z.url().optional(),
  QI_USERNAME: z.string().optional(),
  QI_PASSWORD: z.string().optional(),
  QI_TERMINAL_ID: z.string().optional(),
  /** PEM public key from Qi support, used to verify webhook X-Signature. */
  QI_WEBHOOK_PUBLIC_KEY: z.string().optional(),
  /** ZainCash v1 (see docs/PAYMENTS.md: confirm v1 is still offered before enabling). */
  ZAINCASH_ENV: z.enum(["test", "live"]).default("test"),
  ZAINCASH_MERCHANT_ID: z.string().optional(),
  ZAINCASH_SECRET: z.string().optional(),
  ZAINCASH_MSISDN: z.string().regex(/^964\d{10}$/).optional(),

  PDF_BROWSER_EXECUTABLE: z.string().optional(),
  PDF_BROWSER_CHANNEL: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

function productionGuards(env: Env): string[] {
  const problems: string[] = [];
  if (env.APP_ENV !== "production" && env.APP_ENV !== "staging") return problems;
  if (!env.DATABASE_URL) problems.push("DATABASE_URL is required (PGlite is dev/test only)");
  if (!env.REDIS_URL) problems.push("REDIS_URL is required for shared rate limiting across instances");
  if (!env.APP_ORIGIN.startsWith("https://")) problems.push("APP_ORIGIN must be https:// in production");
  if (env.ENABLE_MOCK_PROVIDERS) problems.push("ENABLE_MOCK_PROVIDERS must be false in production");
  if (env.ALLOW_DEMO_SEED) problems.push("ALLOW_DEMO_SEED must be false in production");
  if (env.TRUSTED_PROXY_HOPS < 1) problems.push("TRUSTED_PROXY_HOPS must be >= 1 behind the reverse proxy");
  if (env.APP_ENV === "production") {
    if (env.PAYMENT_TEST_WEBHOOK_SECRET) problems.push("PAYMENT_TEST_WEBHOOK_SECRET must not be set in production (test gateway)");
    if (env.ZAINCASH_MERCHANT_ID && env.ZAINCASH_ENV !== "live") problems.push("ZAINCASH_ENV must be 'live' in production");
    if (env.QI_API_BASE && /sandbox|uat/i.test(env.QI_API_BASE)) problems.push("QI_API_BASE points at a sandbox host in production");
    if (env.QI_API_BASE && !env.QI_WEBHOOK_PUBLIC_KEY) problems.push("QI_WEBHOOK_PUBLIC_KEY is required when Qi Card is enabled");
  }
  return problems;
}

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Report variable NAMES only, never values.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server configuration: ${names}. See .env.example.`);
  }
  const problems = productionGuards(parsed.data);
  if (problems.length) throw new Error(`Refusing to start: ${problems.join("; ")}`);
  cached = parsed.data;
  return cached;
}

/** For tests only. */
export function resetEnvCache(): void {
  cached = undefined;
}

export const isProd = () => env().APP_ENV === "production" || env().APP_ENV === "staging";
