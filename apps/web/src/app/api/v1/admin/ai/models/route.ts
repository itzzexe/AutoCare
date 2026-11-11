import { route } from "@/server/http/handler";
import { listLocalModels, runtimeVersion } from "@/server/modules/ai/ollama";

/** Locally installed runtime models (cloud/remote models are filtered out). */
export const GET = route({ permission: "admin:learning" }, async () => {
  try {
    return { runtime: await runtimeVersion(), installed: await listLocalModels() };
  } catch {
    return { runtime: null, installed: [], error: "runtime_unreachable" };
  }
});
