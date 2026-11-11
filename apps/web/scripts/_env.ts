import { existsSync } from "node:fs";
import path from "node:path";

/** Scripts load .env.local (development only). Production injects variables from the secret manager. */
for (const f of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), f);
  if (existsSync(p)) process.loadEnvFile(p);
}
