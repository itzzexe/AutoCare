import "server-only";
import type { Metadata } from "next";
import { env } from "../config/env";

/**
 * Indexing is opt-in per page: the root layout is `noindex`, and only public
 * knowledge pages call this. Private pages (account, cases, shared reports,
 * consoles) never become indexable, even with INDEXING_ENABLED=true.
 */
export function publicRobots(): Metadata["robots"] {
  return env().INDEXING_ENABLED ? { index: true, follow: true } : { index: false, follow: false };
}

export function canonical(path: string): string {
  return new URL(path, env().APP_ORIGIN).toString();
}
