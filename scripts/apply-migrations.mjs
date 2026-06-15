/**
 * Apply raw .sql migration files to the Supabase Postgres over a direct
 * (service) connection — no psql needed. Uses the project's existing
 * `postgres` (postgres-js) dependency.
 *
 * Usage (run by the user; needs a privileged DB URL):
 *   SUPABASE_DB_URL="postgresql://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres" \
 *     node scripts/apply-migrations.mjs \
 *     src/server/db/migrations/0005_discourse_collab.sql \
 *     src/server/db/migrations/0006_discourse_rls.sql
 *
 * Get SUPABASE_DB_URL from: Supabase dashboard → Settings → Database →
 * Connection string → URI (use the "Direct connection", port 5432, for DDL).
 *
 * Notes:
 * - CREATE TABLE / INDEX use IF NOT EXISTS → re-running 0005 is safe.
 * - CREATE POLICY has no IF NOT EXISTS in Postgres, so re-running 0006 will
 *   error on already-existing policies. That's expected on a second run; the
 *   tables/policies from the first successful run remain intact.
 */
import postgres from "postgres";
import { readFile } from "node:fs/promises";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("✗ SUPABASE_DB_URL is not set. See the header of this file for where to get it.");
  process.exit(1);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  files.push(
    "src/server/db/migrations/0005_discourse_collab.sql",
    "src/server/db/migrations/0006_discourse_rls.sql"
  );
}

const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });

let failed = false;
for (const f of files) {
  try {
    const text = await readFile(f, "utf8");
    await sql.unsafe(text); // simple protocol — supports multiple statements
    console.log(`✓ applied ${f}`);
  } catch (e) {
    failed = true;
    console.error(`✗ ${f}: ${e.message}`);
  }
}

await sql.end({ timeout: 5 });
process.exit(failed ? 1 : 0);
