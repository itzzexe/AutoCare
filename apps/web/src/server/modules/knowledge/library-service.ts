import "server-only";
import { and, asc, count, eq, gt, isNull, like, ne, or, sql } from "drizzle-orm";
import { getDb } from "../../db/client";
import { dtcDefinitions, faultGuides, sourceRecords } from "../../db/schema";

/**
 * Browsing views over the knowledge base: the symptom/warning-light guides and
 * the generic code library index. Read-only; content comes from seeded,
 * versioned sources and keeps its review status visible.
 */

export const GUIDE_CATEGORIES = [
  "warning_light", "starting", "engine", "cooling", "brakes", "steering", "transmission",
  "electrical", "ac", "fuel", "suspension", "tyres", "noise", "vibration", "smoke", "smell", "leak",
] as const;
export type GuideCategory = (typeof GUIDE_CATEGORIES)[number];

export const CODE_SYSTEMS = ["P", "B", "C", "U"] as const;

type Guide = typeof faultGuides.$inferSelect;

export interface GuideSummary {
  slug: string;
  category: string;
  titleAr: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  urgency: Guide["urgency"];
  safetyArea: Guide["safetyArea"];
  reviewStatus: Guide["reviewStatus"];
}

const summary = (g: Guide): GuideSummary => ({
  slug: g.slug, category: g.category, titleAr: g.titleAr, titleEn: g.titleEn, summaryAr: g.summaryAr, summaryEn: g.summaryEn,
  urgency: g.urgency, safetyArea: g.safetyArea, reviewStatus: g.reviewStatus,
});

const liveSource = () => and(eq(sourceRecords.status, "active"), or(isNull(sourceRecords.expiresAt), gt(sourceRecords.expiresAt, new Date())));

export async function listGuides(category?: string): Promise<GuideSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({ g: faultGuides })
    .from(faultGuides)
    .innerJoin(sourceRecords, eq(sourceRecords.id, faultGuides.sourceRecordId))
    .where(and(ne(faultGuides.reviewStatus, "retired"), liveSource(), category ? eq(faultGuides.category, category) : undefined))
    .orderBy(asc(faultGuides.category), asc(faultGuides.slug));
  return rows.map((r) => summary(r.g));
}

export interface GuideDetail extends GuideSummary {
  symptoms: Guide["symptoms"];
  causes: Guide["causes"];
  checks: Guide["checks"];
  fixes: Guide["fixes"];
  relatedCodes: Array<{ code: string; titleAr: string; titleEn: string }>;
  version: string;
  sourceTitle: string;
}

export async function getGuide(slug: string): Promise<GuideDetail | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ g: faultGuides, sourceTitle: sourceRecords.title })
    .from(faultGuides)
    .innerJoin(sourceRecords, eq(sourceRecords.id, faultGuides.sourceRecordId))
    .where(and(eq(faultGuides.slug, slug), ne(faultGuides.reviewStatus, "retired"), liveSource()))
    .limit(1);
  if (!row) return null;
  const g = row.g;
  const codes = g.relatedCodes.length
    ? await db
        .selectDistinctOn([dtcDefinitions.code], { code: dtcDefinitions.code, titleAr: dtcDefinitions.titleAr, titleEn: dtcDefinitions.titleEn })
        .from(dtcDefinitions)
        .where(and(eq(dtcDefinitions.scope, "generic"), ne(dtcDefinitions.reviewStatus, "retired"), sql`${dtcDefinitions.code} = any(${sql.raw("array[")}${sql.join(g.relatedCodes.map((c) => sql`${c}`), sql`, `)}${sql.raw("]::text[]")})`))
        .orderBy(dtcDefinitions.code)
    : [];
  return {
    ...summary(g),
    symptoms: g.symptoms,
    causes: g.causes,
    checks: [...g.checks].sort((a, b) => a.invasiveness - b.invasiveness),
    fixes: g.fixes,
    relatedCodes: g.relatedCodes.map((c) => codes.find((x) => x.code === c) ?? { code: c, titleAr: "", titleEn: "" }),
    version: g.version,
    sourceTitle: row.sourceTitle,
  };
}

export interface CodeIndexItem {
  code: string;
  titleAr: string;
  titleEn: string;
  system: string;
  safetyArea: string;
  baseUrgency: string;
  reviewStatus: string;
}

/** Generic code library, paged. `prefix` is a validated code prefix such as "P03" or "U". */
export async function listCodes(opts: { prefix?: string; page?: number; pageSize?: number }): Promise<{ items: CodeIndexItem[]; total: number; page: number; pageSize: number }> {
  const db = await getDb();
  const pageSize = Math.min(Math.max(opts.pageSize ?? 60, 1), 200);
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const prefix = opts.prefix && /^[PBCU][0-9A-F]{0,3}$/.test(opts.prefix) ? opts.prefix : undefined;
  const where = and(
    eq(dtcDefinitions.scope, "generic"),
    ne(dtcDefinitions.reviewStatus, "retired"),
    prefix ? like(dtcDefinitions.code, `${prefix}%`) : undefined,
  );
  const [{ n }] = (await db.select({ n: count(sql`distinct ${dtcDefinitions.code}`) }).from(dtcDefinitions).where(where)) as [{ n: number }];
  const items = await db
    .selectDistinctOn([dtcDefinitions.code], {
      code: dtcDefinitions.code, titleAr: dtcDefinitions.titleAr, titleEn: dtcDefinitions.titleEn, system: dtcDefinitions.system,
      safetyArea: dtcDefinitions.safetyArea, baseUrgency: dtcDefinitions.baseUrgency, reviewStatus: dtcDefinitions.reviewStatus,
    })
    .from(dtcDefinitions)
    .where(where)
    .orderBy(dtcDefinitions.code)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { items, total: Number(n), page, pageSize };
}

/** Counts per first-two-character group, used for the library navigation. */
export async function codeGroups(): Promise<Array<{ group: string; n: number }>> {
  const db = await getDb();
  const rows = await db
    .select({ group: sql<string>`substr(${dtcDefinitions.code}, 1, 3)`, n: count(sql`distinct ${dtcDefinitions.code}`) })
    .from(dtcDefinitions)
    .where(and(eq(dtcDefinitions.scope, "generic"), ne(dtcDefinitions.reviewStatus, "retired")))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return rows.map((r) => ({ group: r.group, n: Number(r.n) }));
}

/** Everything public and indexable, for the sitemap. */
export async function sitemapEntries(): Promise<{ codes: string[]; guides: string[] }> {
  const db = await getDb();
  const codes = await db.selectDistinct({ code: dtcDefinitions.code }).from(dtcDefinitions).where(and(eq(dtcDefinitions.scope, "generic"), ne(dtcDefinitions.reviewStatus, "retired")));
  const guides = await db.select({ slug: faultGuides.slug }).from(faultGuides).where(ne(faultGuides.reviewStatus, "retired"));
  return { codes: codes.map((c) => c.code).sort(), guides: guides.map((g) => g.slug).sort() };
}

/** Guides that list this code as related (shown on the code page). */
export async function guidesForCode(code: string): Promise<GuideSummary[]> {
  if (!/^[PBCU][0-9A-F]{4}$/.test(code)) return [];
  const db = await getDb();
  const rows = await db
    .select({ g: faultGuides })
    .from(faultGuides)
    .where(and(ne(faultGuides.reviewStatus, "retired"), sql`${faultGuides.relatedCodes} ? ${code}`))
    .orderBy(faultGuides.slug)
    .limit(6);
  return rows.map((r) => summary(r.g));
}
