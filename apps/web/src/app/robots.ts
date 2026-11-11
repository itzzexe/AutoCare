import type { MetadataRoute } from "next";
import { env } from "@/server/config/env";

export const dynamic = "force-dynamic";

const PRIVATE = ["/api/", "/account", "/admin", "/cases", "/cart", "/orders", "/merchant", "/workshop/", "/review", "/r/", "/diagnose", "/garage", "/login", "/register"];

export default function robots(): MetadataRoute.Robots {
  const e = env();
  if (!e.INDEXING_ENABLED) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return { rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE }], sitemap: new URL("/sitemap.xml", e.APP_ORIGIN).toString() };
}
