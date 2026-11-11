import { customType, timestamp, uuid } from "drizzle-orm/pg-core";

/** Non-sequential UUID primary key (gen_random_uuid, PG13+ core). */
export const pk = () => uuid("id").primaryKey().defaultRandom();

/** All timestamps are timestamptz (stored UTC, rendered in the viewer's zone). */
export const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
export const createdAt = () => ts("created_at").notNull().defaultNow();
export const updatedAt = () => ts("updated_at").notNull().defaultNow();

/** Encrypted field envelope (AES-256-GCM, see server/lib/crypto.ts). Stored as text. */
export const encrypted = customType<{ data: string; driverData: string }>({
  dataType: () => "text",
});

export const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => "tsvector",
});
