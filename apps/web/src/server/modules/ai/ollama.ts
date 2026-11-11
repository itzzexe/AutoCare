import "server-only";
import { isIP } from "node:net";
import { env } from "../../config/env";
import { AppError } from "../../lib/errors";

/**
 * Minimal client for a self-hosted Ollama runtime (docs.ollama.com, verified
 * 2026-10-02). The runtime is a separate service and may run on another
 * machine on the private network (OLLAMA_URL). There is NO cloud fallback:
 *  - OLLAMA_URL must resolve to loopback/private address space in local_only mode
 *  - models whose name marks them as Ollama Cloud models, or that report a
 *    remote_host in /api/tags, are refused
 * Run the server with OLLAMA_NO_CLOUD=1 as well (see docs/DEPLOYMENT.md).
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  content: string;
  promptTokens?: number;
  outputTokens?: number;
  totalMs?: number;
  doneReason?: string;
}

function isPrivateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".internal") || h.endsWith(".local") || /^[a-z0-9-]+$/i.test(h)) return true; // docker service names
  if (isIP(h) === 4) {
    const [a, b] = h.split(".").map(Number) as [number, number];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (isIP(h) === 6) return h === "::1" || h.startsWith("fd") || h.startsWith("fc");
  return false;
}

export function assertLocalOnly(model: string): void {
  if (env().AI_MODE !== "local_only") throw new AppError("ai_unavailable", "ai_disabled");
  const url = new URL(env().OLLAMA_URL);
  if (!isPrivateHost(url.hostname)) throw new AppError("ai_unavailable", "runtime_not_private");
  if (/(^|[-:])cloud($|[-:])/i.test(model)) throw new AppError("ai_unavailable", "cloud_model_refused");
}

async function call<T>(path: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  const onAbort = () => controller.abort(new Error("cancelled"));
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(new URL(path, env().OLLAMA_URL), {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      redirect: "error",
      cache: "no-store",
    });
    if (res.status === 503) throw new AppError("ai_busy", "runtime_queue_full");
    if (res.status === 404) throw new AppError("ai_unavailable", "model_not_installed");
    if (!res.ok) throw new AppError("ai_unavailable", `runtime_http_${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (controller.signal.aborted) {
      const reason = (controller.signal.reason as Error | undefined)?.message;
      throw new AppError("ai_unavailable", reason === "cancelled" ? "cancelled" : "timeout");
    }
    throw new AppError("ai_unavailable", "runtime_unreachable");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

interface TagsResponse {
  models: Array<{ name: string; model: string; size: number; remote_host?: string; details?: { parameter_size?: string; quantization_level?: string; family?: string } }>;
}

export async function listLocalModels(): Promise<TagsResponse["models"]> {
  const r = await call<TagsResponse>("/api/tags", undefined, 4_000);
  return r.models.filter((m) => !m.remote_host);
}

export async function runtimeVersion(): Promise<string | null> {
  try {
    return (await call<{ version: string }>("/api/version", undefined, 3_000)).version;
  } catch {
    return null;
  }
}

export async function chatJson(model: string, messages: ChatMessage[], schema: object, signal?: AbortSignal): Promise<ChatResult> {
  assertLocalOnly(model);
  const e = env();
  const r = await call<{
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
    total_duration?: number;
    done_reason?: string;
  }>(
    "/api/chat",
    {
      model,
      messages,
      stream: false,
      format: schema,
      // Qwen3 "thinking" output is not needed for structured answers.
      think: false,
      keep_alive: "10m",
      options: { temperature: 0, num_ctx: e.AI_NUM_CTX, num_predict: e.AI_MAX_OUTPUT_TOKENS, seed: 7 },
    },
    e.AI_TIMEOUT_MS,
    signal,
  );
  return {
    content: r.message?.content ?? "",
    promptTokens: r.prompt_eval_count,
    outputTokens: r.eval_count,
    totalMs: r.total_duration ? Math.round(r.total_duration / 1e6) : undefined,
    doneReason: r.done_reason,
  };
}

export async function embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
  const model = env().AI_EMBED_MODEL;
  assertLocalOnly(model);
  const r = await call<{ embeddings: number[][] }>("/api/embed", { model, input: texts, truncate: true, keep_alive: "10m" }, 60_000, signal);
  return r.embeddings;
}
