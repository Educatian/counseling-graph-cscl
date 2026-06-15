/**
 * Apply .sql migration files through the Supabase Management API — no psql, no
 * database password, no exposed service_role key. Authenticates with a Supabase
 * Personal Access Token (PAT, `sbp_...`) and runs SQL via
 *   POST https://api.supabase.com/v1/projects/{ref}/database/query
 *
 * This is what actually provisioned the Phase-C discourse tables (0005/0006).
 *
 * Usage (run by the user; PAT is sensitive — env only, never commit it):
 *   SUPABASE_ACCESS_TOKEN="sbp_xxx" SUPABASE_PROJECT_REF="qshdxoaxbaunctalzwfb" \
 *     node scripts/apply-migrations-api.mjs \
 *     src/server/db/migrations/0005_discourse_collab.sql \
 *     src/server/db/migrations/0006_discourse_rls.sql
 *
 * PAT: Supabase dashboard → Account → Access Tokens. Revoke when done.
 *
 * Gotcha: the Management API sits behind Cloudflare, which 403s (error 1010)
 * the default Node/urllib User-Agent — so a browser-like UA header is required.
 */
import { readFile } from "node:fs/promises";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error("✗ Set SUPABASE_ACCESS_TOKEN (sbp_...) and SUPABASE_PROJECT_REF. See file header.");
  process.exit(1);
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const ENDPOINT = `https://api.supabase.com/v1/projects/${ref}/database/query`;

async function runSql(sql) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": UA
    },
    body: JSON.stringify({ query: sql })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 240)}`);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  files.push(
    "src/server/db/migrations/0005_discourse_collab.sql",
    "src/server/db/migrations/0006_discourse_rls.sql"
  );
}

let failed = false;
for (const f of files) {
  try {
    await runSql(await readFile(f, "utf8"));
    console.log(`✓ applied ${f}`);
  } catch (e) {
    failed = true;
    console.error(`✗ ${f}: ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
