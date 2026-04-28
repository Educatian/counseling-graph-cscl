import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required to run migrations");

// Migrations need a session-mode connection (not pgbouncer transaction mode)
// because they create types/tables. Always use the direct DATABASE_URL here.
const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

console.log("[migrate] running pending migrations...");
await migrate(db, { migrationsFolder: "./src/server/db/migrations" });
console.log("[migrate] done.");
await sql.end();
