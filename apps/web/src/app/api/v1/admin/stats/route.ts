import { route } from "@/server/http/handler";
import * as admin from "@/server/modules/admin/service";
import { env } from "@/server/config/env";
import { gateStats } from "@/server/modules/ai/gate";
import { runtimeVersion } from "@/server/modules/ai/ollama";

export const GET = route({ permission: "admin:audit" }, async () => ({ counts: await admin.platformCounts(), ai: { ...gateStats(), mode: env().AI_MODE, model: env().AI_MODEL, embed: env().AI_EMBED_MODEL, runtime: await runtimeVersion() } }));
