import "server-only";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { env } from "../config/env";
import * as schema from "./schema";

/**
 * Database access. PostgreSQL (node-postgres pool) whenever DATABASE_URL is
 * set — always in production. Without it (local dev / tests only) an embedded
 * PGlite instance (real Postgres compiled to WASM, with pgvector) is used so
 * the app runs without Docker. Production refuses to start without DATABASE_URL.
 */

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type Holder = { db?: Db; ready?: Promise<Db>; close?: () => Promise<void> };
const g = globalThis as unknown as { __autocareDb?: Holder };
const holder: Holder = (g.__autocareDb ??= {});

export const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

async function connectPostgres(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({
    connectionString: url,
    max: 10,
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 15_000,
    application_name: "autocare-web",
  });
  holder.close = () => pool.end();
  return drizzle(pool, { schema }) as unknown as Db;
}

async function connectPglite(dir: string | undefined): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite-pgvector");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await PGlite.create(dir ? { dataDir: dir, extensions: { vector } } : { extensions: { vector } });
  const db = drizzle(client, { schema });
  // Embedded dev/test database migrates itself; real Postgres uses `pnpm db:migrate`.
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  holder.close = () => client.close();
  return db as unknown as Db;
}

export async function getDb(): Promise<Db> {
  if (holder.db) return holder.db;
  holder.ready ??= (async () => {
    const e = env();
    const db = e.DATABASE_URL
      ? await connectPostgres(e.DATABASE_URL)
      : await connectPglite(e.APP_ENV === "test" ? undefined : path.resolve(e.PGLITE_DIR));
    holder.db = db;
    return db;
  })();
  return holder.ready;
}

export async function closeDb(): Promise<void> {
  await holder.close?.();
  holder.db = undefined;
  holder.ready = undefined;
  holder.close = undefined;
}

export { schema };
