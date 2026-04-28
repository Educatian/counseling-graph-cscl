import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is required. Set it in .env.local (see .env.example) before starting the server."
  );
}

// postgres.js: prepare:false is recommended for Supabase pgbouncer transaction mode.
// max=1 keeps the pool tiny in serverless / edge contexts; bump for traditional servers.
export const sql = postgres(url, {
  prepare: false,
  max: Number(process.env.PG_POOL_MAX ?? 10),
  idle_timeout: 30,
  connect_timeout: 10
});

export const db = drizzle(sql, { schema });
export { schema };
