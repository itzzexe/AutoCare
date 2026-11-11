import "./_env";
import { closeDb } from "../src/server/db/client";
import { indexPendingEmbeddings } from "../src/server/modules/ai/rag";

/** Explicit step: embed RAG chunks with the local embedding model (AI_EMBED_MODEL). */
indexPendingEmbeddings()
  .then(async (r) => {
    console.log(`embedded ${r.embedded} chunks with ${process.env.AI_EMBED_MODEL ?? "bge-m3"}`);
    await closeDb();
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
