import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");

const sql = postgres(url, { prepare: false, max: 1 });

console.log("=== Tables ===");
const tables = await sql<{ tablename: string }[]>`
  SELECT tablename FROM pg_tables
  WHERE schemaname='public' ORDER BY tablename
`;
for (const t of tables) console.log(`  ${t.tablename}`);

console.log("\n=== Views ===");
const views = await sql<{ viewname: string }[]>`
  SELECT viewname FROM pg_views
  WHERE schemaname='public' ORDER BY viewname
`;
for (const v of views) console.log(`  ${v.viewname}`);

console.log("\n=== Functions (custom) ===");
const fns = await sql<{ proname: string }[]>`
  SELECT proname FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname='public' AND proname NOT LIKE 'pg_%'
  ORDER BY proname
`;
for (const f of fns) console.log(`  ${f.proname}()`);

console.log("\n=== consents table RLS + policies ===");
const consentRls = await sql<{ tablename: string; rls: boolean }[]>`
  SELECT tablename, rowsecurity AS rls FROM pg_tables
  WHERE schemaname='public' AND tablename='consents'
`;
console.log(`  rls: ${consentRls[0]?.rls ? "ON" : "off"}`);
const consentPols = await sql<{ policyname: string; cmd: string }[]>`
  SELECT policyname, cmd FROM pg_policies
  WHERE schemaname='public' AND tablename='consents'
  ORDER BY policyname
`;
for (const p of consentPols) console.log(`  policy: ${p.policyname} [${p.cmd}]`);

console.log("\n=== event_log analytics indexes ===");
const idx = await sql<{ indexname: string; indexdef: string }[]>`
  SELECT indexname, indexdef FROM pg_indexes
  WHERE schemaname='public' AND tablename='event_log'
  ORDER BY indexname
`;
for (const i of idx) console.log(`  ${i.indexname}`);

console.log("\n=== smoke: cohort_engagement_summary right now ===");
const eng = await sql<{
  cohort_id: string; active_users: number; sessions: number;
  total_events: number; node_opens: number;
}[]>`
  SELECT cohort_id, active_users, sessions, total_events, node_opens
  FROM public.cohort_engagement_summary
`;
for (const r of eng) console.log(`  ${r.cohort_id}: ${r.active_users} users · ${r.sessions} sessions · ${r.total_events} events (${r.node_opens} node_opens)`);

console.log("\n=== smoke: lag_sequential for instructor user ===");
const lag = await sql<{ prev_kind: string; next_kind: string; n: number }[]>`
  SELECT * FROM public.lag_sequential_counts('b4b10a99-abb5-440f-bcd3-b2d802f46a2a') LIMIT 5
`;
for (const l of lag) console.log(`  ${l.prev_kind} → ${l.next_kind} (n=${l.n})`);

await sql.end();
