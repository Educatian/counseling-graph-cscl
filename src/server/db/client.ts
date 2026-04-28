import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

/**
 * Lazy DB client init — defers connection establishment until first use so the
 * module can be imported in environments that don't have `process.env` populated
 * at module-load time (e.g. Cloudflare Pages Functions, where env vars are
 * passed in via the request context).
 *
 * Workers/Pages Functions need `compatibility_flags = ["nodejs_compat"]` for
 * postgres.js to use TCP sockets via cloudflare:sockets. The pooler URL
 * (DATABASE_POOLER_URL on port 6543) is the right target there.
 */

type PgClient = ReturnType<typeof postgres>;
type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let _sql: PgClient | null = null;
let _db: DrizzleDb | null = null;
let _connectedUrl: string | null = null;

export function getDb(databaseUrl?: string): { db: DrizzleDb; sql: PgClient } {
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL required (set in .env.local or pass explicitly)");
  }
  // If a different URL is requested, recreate the client (rare; mostly tests).
  if (_db && _connectedUrl === url) return { db: _db, sql: _sql! };

  _sql = postgres(url, {
    prepare: false,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idle_timeout: 30,
    connect_timeout: 10
  });
  _db = drizzle(_sql, { schema });
  _connectedUrl = url;
  return { db: _db, sql: _sql };
}

// Backwards-compat: keep `db` and `sql` as eager exports for code that still
// expects them, by reading process.env at first access via getters. Throws if
// env isn't populated.
export const schemaRef = schema;
export { schema };

export function getDbOrThrow() {
  return getDb().db;
}
