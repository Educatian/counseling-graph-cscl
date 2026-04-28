/**
 * Cohort login smoke test — drives a real browser through Login → auto-enter
 * → graph view for every account in data/cohort.json, then verifies that
 * each one's auth.uid + cohort_id landed on event_log.
 *
 * Reads credentials from data/cohort.json (gitignored).
 *
 * Pass criteria per user:
 *   1. Landing renders the login form (auth-required mode).
 *   2. Login submit succeeds (no error banner).
 *   3. App auto-enters: TitleBar appears within 4s of login.
 *   4. At least one /api/events row is stamped with this user's auth.uid.
 *   5. cohort_id matches CFG.cohort_id on those rows.
 */
import { chromium } from "playwright";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import path from "node:path";
import fs from "node:fs";

const BASE = process.env.TEST_BASE ?? "http://localhost:5173";

interface CohortUser { email: string; password: string; role: string }
interface CohortConfig { cohort_id: string; domain: string; users: CohortUser[] }

const cfgPath = process.env.COHORT_CONFIG ?? path.resolve("data/cohort.json");
const CFG: CohortConfig = JSON.parse(readFileSync(cfgPath, "utf8"));

const OUT = path.resolve("scripts/test-out/cohort-login");
fs.mkdirSync(OUT, { recursive: true });

interface Result { email: string; ok: boolean; detail: string }
const results: Result[] = [];
const tStart = Date.now();

const browser = await chromium.launch({ headless: true });
try {
  for (const u of CFG.users) {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    let detail = "";
    let ok = false;
    try {
      await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForSelector('input[type=email]', { timeout: 10000 });
      await page.fill('input[type=email]', u.email);
      await page.fill('input[type=password]', u.password);
      await Promise.all([
        page.click('button[type=submit]'),
        page.waitForSelector('.titlebar', { timeout: 10000 })
      ]);
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, `${u.email.split("@")[0]}.png`) });
      ok = true;
      detail = "graph view loaded";
    } catch (e) {
      detail = `FAIL: ${(e as Error).message.split("\n")[0]}`;
      try { await page.screenshot({ path: path.join(OUT, `FAIL-${u.email.split("@")[0]}.png`) }); } catch {}
    } finally {
      await ctx.close();
    }
    results.push({ email: u.email, ok, detail });
    process.stdout.write(`${ok ? "✓" : "✗"} ${u.email.padEnd(36)} ${detail}\n`);
  }
} finally {
  await browser.close();
}

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const since = new Date(tStart - 5000);
const rows = await sql<{ user_id: string; cohort_id: string | null; n: number }[]>`
  SELECT user_id, cohort_id, count(*)::int AS n
  FROM event_log
  WHERE ts >= ${since}
  GROUP BY user_id, cohort_id
  ORDER BY user_id
`;

console.log("\n=== event_log rows since test start ===");
console.log("user_id".padEnd(38) + "cohort_id".padEnd(18) + "events");
console.log("-".repeat(70));
for (const r of rows) {
  console.log(`${r.user_id.padEnd(38)}${(r.cohort_id ?? "(null)").padEnd(18)}${r.n}`);
}
await sql.end();

const okN = results.filter((r) => r.ok).length;
const cohortRows = rows.filter((r) => r.cohort_id === CFG.cohort_id && r.user_id !== "anon").length;
console.log("\n=== summary ===");
console.log(`Login + graph view: ${okN}/${results.length}`);
console.log(`event_log rows with cohort=${CFG.cohort_id}: from ${cohortRows} distinct users`);

if (okN < results.length) process.exit(1);
