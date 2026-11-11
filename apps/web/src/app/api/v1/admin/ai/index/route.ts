import { route } from "@/server/http/handler";
import { indexPendingEmbeddings } from "@/server/modules/ai/rag";

/** Explicit admin action: embed pending RAG chunks with the local embedding model. */
export const POST = route({ permission: "admin:learning", timeoutMs: 300_000 }, async () => indexPendingEmbeddings());
