import { publicRoute } from "@/server/http/handler";
import { sql } from "drizzle-orm";
import { env } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import { runtimeVersion } from "@/server/modules/ai/ollama";

/** Readiness: database reachable; AI runtime state reported honestly (not required for readiness). */
export const GET = publicRoute({ auth: "none" }, async () => {
  const db = await getDb();
  await db.execute(sql`select 1`);
  const ai = env().AI_MODE === "disabled" ? "disabled" : (await runtimeVersion()) ? "reachable" : "unreachable";
  return { status: "ready", database: "ok", redis: env().REDIS_URL ? "configured" : "memory_fallback_dev_only", ai };
});
