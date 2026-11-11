import type { MetadataRoute } from "next";
import { env } from "@/server/config/env";
import { sitemapEntries } from "@/server/modules/knowledge/library-service";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const e = env();
  if (!e.INDEXING_ENABLED) return [];
  const { codes, guides } = await sitemapEntries();
  const u = (p: string) => new URL(p, e.APP_ORIGIN).toString();
  return [
    { url: u("/"), changeFrequency: "weekly", priority: 1 },
    { url: u("/guides"), changeFrequency: "weekly", priority: 0.9 },
    { url: u("/codes"), changeFrequency: "weekly", priority: 0.9 },
    { url: u("/workshops"), changeFrequency: "daily", priority: 0.7 },
    { url: u("/market"), changeFrequency: "daily", priority: 0.7 },
    { url: u("/pricing"), changeFrequency: "monthly", priority: 0.5 },
    ...guides.map((s) => ({ url: u(`/guides/${s}`), changeFrequency: "monthly" as const, priority: 0.8 })),
    ...codes.map((c) => ({ url: u(`/codes/${c}`), changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
