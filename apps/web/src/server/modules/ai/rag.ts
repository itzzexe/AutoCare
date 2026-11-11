import "server-only";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { searchKey } from "@autocare/contracts";
import { env } from "../../config/env";
import { getDb } from "../../db/client";
import { knowledgeChunks, knowledgeDocuments, sourceRecords } from "../../db/schema";
import { logger } from "../../lib/logger";
import { embed } from "./ollama";

/**
 * Hybrid retrieval over the licensed corpus: Postgres full-text (simple
 * config on a normalised column) + pgvector cosine similarity when embeddings
 * exist, merged with reciprocal-rank fusion. Filters are hard constraints:
 *   - document active AND rag_allowed (derived from the source licence)
 *   - source record active and not past cache expiry
 *   - vehicle make matches or document is make-agnostic; year inside range
 * Retrieved text is DATA for the model, never instructions (see prompt.ts).
 */

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  sourceRecordId: string;
  title: string;
  kind: string;
  content: string;
  score: number;
}

export interface RetrievalQuery {
  codes: string[];
  symptoms: string;
  make: string;
  year: number | null;
  limit?: number;
  /**
   * Grounding: when set, only documents tagged with at least one of these codes
   * are eligible (used when the session's codes are covered), so the model
   * cannot cite unrelated material for a code.
   */
  restrictToCodes?: string[];
}

const RRF_K = 60;

export async function retrieve(q: RetrievalQuery): Promise<{ chunks: RetrievedChunk[]; vectorUsed: boolean }> {
  const db = await getDb();
  const limit = q.limit ?? 6;
  const now = new Date();
  const filters = and(
    eq(knowledgeDocuments.status, "active"),
    eq(knowledgeDocuments.ragAllowed, true),
    eq(sourceRecords.status, "active"),
    or(isNull(sourceRecords.expiresAt), sql`${sourceRecords.expiresAt} > ${now}`),
    or(isNull(knowledgeDocuments.make), sql`lower(${knowledgeDocuments.make}) = lower(${q.make})`),
    q.year == null ? undefined : or(isNull(knowledgeDocuments.yearFrom), lte(knowledgeDocuments.yearFrom, q.year)),
    q.year == null ? undefined : or(isNull(knowledgeDocuments.yearTo), gte(knowledgeDocuments.yearTo, q.year)),
    q.restrictToCodes?.length ? sql`${knowledgeDocuments.codes} ?| ${sql.raw("array[")}${sql.join(q.restrictToCodes.map((c) => sql`${c}`), sql`, `)}${sql.raw("]::text[]")}` : undefined,
    // Grounded mode reads only the code reference documents themselves; symptom
    // guides that merely list a code as "related" stay out of the context.
    q.restrictToCodes?.length ? eq(knowledgeDocuments.kind, "dtc_reference") : undefined,
  );

  const base = () =>
    db
      .select({
        chunkId: knowledgeChunks.id,
        documentId: knowledgeDocuments.id,
        sourceRecordId: knowledgeDocuments.sourceRecordId,
        title: knowledgeDocuments.title,
        kind: knowledgeDocuments.kind,
        content: knowledgeChunks.content,
      })
      .from(knowledgeChunks)
      .innerJoin(knowledgeDocuments, eq(knowledgeDocuments.id, knowledgeChunks.documentId))
      .innerJoin(sourceRecords, eq(sourceRecords.id, knowledgeDocuments.sourceRecordId));

  // --- lexical ---
  const words = [...q.codes.map((c) => c.toLowerCase()), ...searchKey(q.symptoms).split(" ")]
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length > 1)
    .slice(0, 16);
  const tsq = [...new Set(words)].map((w) => `${w}:*`).join(" | ");
  const lexical = tsq
    ? await base()
        .where(and(filters, sql`${knowledgeChunks.tsv} @@ to_tsquery('simple', ${tsq})`))
        .orderBy(sql`ts_rank(${knowledgeChunks.tsv}, to_tsquery('simple', ${tsq})) desc`)
        .limit(limit * 2)
    : [];

  // --- semantic (optional) ---
  let semantic: typeof lexical = [];
  let vectorUsed = false;
  const hasVectors = await db
    .select({ id: knowledgeChunks.id })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.embeddingModel, env().AI_EMBED_MODEL))
    .limit(1);
  if (hasVectors.length && (q.symptoms.trim() || q.codes.length)) {
    try {
      const [vec] = await embed([`${q.codes.join(" ")} ${q.symptoms}`.slice(0, 2000)]);
      if (vec) {
        const literal = `[${vec.join(",")}]`;
        semantic = await base()
          .where(and(filters, eq(knowledgeChunks.embeddingModel, env().AI_EMBED_MODEL)))
          .orderBy(sql`${knowledgeChunks.embedding} <=> ${literal}::vector`)
          .limit(limit * 2);
        vectorUsed = true;
      }
    } catch (e) {
      logger.warn({ err: (e as Error).message }, "semantic retrieval skipped");
    }
  }

  const scores = new Map<string, { row: (typeof lexical)[number]; score: number }>();
  const add = (rows: typeof lexical) =>
    rows.forEach((row, i) => {
      const cur = scores.get(row.chunkId) ?? { row, score: 0 };
      cur.score += 1 / (RRF_K + i + 1);
      scores.set(row.chunkId, cur);
    });
  add(lexical);
  add(semantic);
  const chunks = [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row, score }) => ({ ...row, score }));
  return { chunks, vectorUsed };
}

/** Split text into ~900-char chunks on paragraph/sentence boundaries. */
export function chunkText(text: string, size = 900): string[] {
  const parts = text.split(/\n{2,}|(?<=[.!؟?])\s+/);
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).length > size && cur) {
      out.push(cur.trim());
      cur = p;
    } else cur = cur ? `${cur} ${p}` : p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Embed chunks that lack an embedding for the configured model. Explicit admin/script action. */
export async function indexPendingEmbeddings(batch = 16): Promise<{ embedded: number }> {
  const db = await getDb();
  const model = env().AI_EMBED_MODEL;
  let embedded = 0;
  for (;;) {
    const rows = await db
      .select({ id: knowledgeChunks.id, content: knowledgeChunks.content })
      .from(knowledgeChunks)
      .innerJoin(knowledgeDocuments, eq(knowledgeDocuments.id, knowledgeChunks.documentId))
      .where(and(eq(knowledgeDocuments.ragAllowed, true), or(isNull(knowledgeChunks.embeddingModel), sql`${knowledgeChunks.embeddingModel} <> ${model}`)))
      .limit(batch);
    if (!rows.length) break;
    const vectors = await embed(rows.map((r) => r.content));
    for (let i = 0; i < rows.length; i++) {
      const v = vectors[i];
      if (!v || v.length !== 1024) throw new Error(`embedding dimension ${v?.length} != 1024 for ${model}`);
      await db.update(knowledgeChunks).set({ embedding: v, embeddingModel: model }).where(eq(knowledgeChunks.id, rows[i]!.id));
    }
    embedded += rows.length;
  }
  return { embedded };
}
