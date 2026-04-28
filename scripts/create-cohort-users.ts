/**
 * One-shot cohort user provisioning for the closed Phase 0 / pilot.
 *
 * Reuses the Supabase Auth admin endpoint with the project's service_role
 * JWT. mailer_autoconfirm is enabled at the project level, so users land
 * pre-confirmed and can sign in immediately.
 *
 * Re-running is safe — existing accounts are detected via the admin GET
 * endpoint and surfaced as `(existed)` rather than overwritten.
 *
 * Reads the cohort definition from data/cohort.json (gitignored), which
 * contains email + password + role + display_name + cohort_id. Never
 * commit that file.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export {}; // top-level await needs ESM-module flag

interface CohortUser {
  email: string;
  password: string;
  role: "student" | "instructor" | "expert" | "researcher";
  display_name: string;
}
interface CohortConfig {
  cohort_id: string;
  domain: string;
  users: CohortUser[];
}

const cfgPath = process.env.COHORT_CONFIG ?? resolve("data/cohort.json");
let CFG: CohortConfig;
try {
  CFG = JSON.parse(readFileSync(cfgPath, "utf8"));
} catch (e) {
  console.error(`Failed to read cohort config at ${cfgPath}.`);
  console.error("Create data/cohort.json with shape: { cohort_id, domain, users: [{email, password, role, display_name}, ...] }.");
  console.error("That file is gitignored — never commit it.");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY (or SERVICE_ROLE_KEY) required");
}

interface AdminResp {
  id?: string;
  email?: string;
  email_confirmed_at?: string;
  msg?: string;
  error?: string;
  error_description?: string;
  code?: string;
}

async function createOne(u: CohortUser): Promise<{ user: CohortUser; ok: boolean; detail: string }> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY!,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: {
        role: u.role,
        display_name: u.display_name,
        cohort_id: CFG.cohort_id
      }
    })
  });
  const j = (await r.json()) as AdminResp;
  if (r.ok && j.id) return { user: u, ok: true, detail: j.id };
  // Already exists — try to look up the id and report.
  const existing = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(u.email)}`,
    { headers: { authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY! } }
  );
  if (existing.ok) {
    const list = (await existing.json()) as { users?: { id: string; email: string }[] };
    const hit = list.users?.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());
    if (hit) return { user: u, ok: true, detail: `${hit.id} (existed)` };
  }
  return {
    user: u,
    ok: false,
    detail: j.msg ?? j.error_description ?? j.error ?? `status ${r.status}`
  };
}

const results: Awaited<ReturnType<typeof createOne>>[] = [];
for (const u of CFG.users) {
  results.push(await createOne(u));
}

console.log("\n=== Cohort provisioning report ===");
console.log(`cohort_id: ${CFG.cohort_id}`);
console.log(`domain:    ${CFG.domain}`);
console.log("");
console.log("email".padEnd(36) + "role".padEnd(12) + "result");
console.log("-".repeat(80));
for (const r of results) {
  console.log(
    r.user.email.padEnd(36) +
      r.user.role.padEnd(12) +
      (r.ok ? "OK · " + r.detail : "FAIL · " + r.detail)
  );
}
const okCount = results.filter((r) => r.ok).length;
console.log("-".repeat(80));
console.log(`${okCount}/${results.length} provisioned`);
console.log("\n(Passwords intentionally not printed — see data/cohort.json.)");
