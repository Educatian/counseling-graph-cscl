/**
 * E2E test against the deployed GitHub Pages URL — proves the full
 * production pipeline (browser → supabase-js → Supabase trigger → row).
 * Logs in as student05, opens the graph, clicks some nodes, then verifies
 * the rows landed with the right user_id + cohort_id stamping.
 */
import { chromium } from "playwright";
import postgres from "postgres";

const URL = "https://educatian.github.io/counseling-graph-cscl/";
const EMAIL = "student05@cgcscl.local";
const PW = "cgcscl-s05";
const STUDENT05_UID = "7335ad01-a33f-4d7e-9d0e-4b1bdb983e10";

console.log(`Driving ${URL} as ${EMAIL}…`);

const tStart = new Date();
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

try {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  console.log("  [1] page loaded");

  await page.waitForSelector('input[type=email]', { timeout: 15000 });
  console.log("  [2] login form visible");

  await page.fill('input[type=email]', EMAIL);
  await page.fill('input[type=password]', PW);
  await Promise.all([
    page.click('button[type=submit]'),
    page.waitForSelector('.titlebar', { timeout: 15000 })
  ]);
  console.log("  [3] login → graph view loaded");

  // Generate a few node_open events by clicking nodes
  await page.waitForTimeout(2000);
  const nodes = page.locator('circle[data-tutorial="entry-hub"]');
  const count = await nodes.count();
  console.log(`  [4] ${count} entry-hub nodes found`);
  if (count > 0) {
    await nodes.first().click({ force: true });
    await page.waitForTimeout(800);
    if (count > 1) {
      await nodes.nth(1).click({ force: true });
      await page.waitForTimeout(800);
    }
  }
  // Try clicking any interactive node
  const allNodes = page.locator('circle');
  const allCount = await allNodes.count();
  console.log(`  [5] ${allCount} total circles in graph`);
  for (let i = 0; i < Math.min(3, allCount); i++) {
    try {
      await allNodes.nth(i).click({ force: true, timeout: 1500 });
      await page.waitForTimeout(400);
    } catch {}
  }
  await page.waitForTimeout(1500);
  console.log("  [6] clicks done, waiting for events to flush");
} catch (e) {
  console.log(`  ✗ FAIL: ${(e as Error).message.split("\n")[0]}`);
} finally {
  await ctx.close();
  await browser.close();
}

// Verify rows landed
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const rows = await sql<{ ts: Date; kind: string; cohort_id: string | null; payload_json: unknown }[]>`
  SELECT ts, kind, cohort_id, payload_json
  FROM event_log
  WHERE user_id = ${STUDENT05_UID}
    AND ts >= ${tStart}
  ORDER BY ts ASC
`;
console.log(`\n=== rows landed since test start (${tStart.toISOString()}) ===`);
console.log(`count: ${rows.length}`);
for (const r of rows) {
  console.log(`  ${r.ts.toISOString()}  cohort=${r.cohort_id}  ${r.kind}  ${JSON.stringify(r.payload_json)}`);
}
await sql.end();

console.log(`\n=== production pipeline verdict ===`);
if (rows.length > 0 && rows.every((r) => r.cohort_id === "pilot_2026")) {
  console.log(`✓ PROD PIPELINE WORKING — events landed with cohort_id stamping intact`);
} else {
  console.log(`✗ NO ROWS or cohort_id missing — investigate`);
  process.exit(1);
}
