import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");

const sql = postgres(url, { prepare: false, max: 1 });

console.log("=== views landed (should see 9 total) ===");
const views = await sql<{ viewname: string }[]>`
  SELECT viewname FROM pg_views
  WHERE schemaname='public' AND viewname LIKE 'event_log_%' OR viewname='cohort_engagement_summary'
  ORDER BY viewname
`;
for (const v of views) console.log(`  ${v.viewname}`);

console.log("\n=== cohorts.micro_analytics_level column exists? ===");
const col = await sql<{ column_name: string; data_type: string; column_default: string }[]>`
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='cohorts' AND column_name='micro_analytics_level'
`;
console.log(col[0] ?? "MISSING");

console.log("\n=== G16 backtrack — current count ===");
const bt = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM public.event_log_backtrack`;
console.log(`  ${bt[0]?.n} rows`);
const btSample = await sql`SELECT * FROM public.event_log_backtrack LIMIT 2`;
for (const r of btSample) console.log("  sample:", r);

console.log("\n=== G19 node_revisit — top 5 ===");
const rv = await sql<{ user_id: string; node_id: string; visit_count: string; sessions_visited: string }[]>`
  SELECT user_id, node_id, visit_count::text, sessions_visited::text
  FROM public.event_log_node_revisit
  ORDER BY visit_count::int DESC LIMIT 5
`;
for (const r of rv) console.log(`  ${r.user_id.slice(0,8)} · ${r.node_id} · ${r.visit_count}× · ${r.sessions_visited} sessions`);

console.log("\n=== G20 bridge_hub_dwell — current count ===");
const bh = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM public.event_log_bridge_hub_dwell`;
console.log(`  ${bh[0]?.n} rows`);

console.log("\n=== G29 inter_session_gap — current count ===");
const isg = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM public.event_log_inter_session_gap`;
console.log(`  ${isg[0]?.n} rows`);
const isgSample = await sql<{ user_id: string; gap_hours: string; prev_n: string; curr_n: string }[]>`
  SELECT user_id, gap_hours::text, prev_n::text, curr_n::text
  FROM public.event_log_inter_session_gap LIMIT 3
`;
for (const r of isgSample) console.log(`  ${r.user_id.slice(0,8)} · session ${r.prev_n}→${r.curr_n} · ${Number(r.gap_hours).toFixed(2)}h`);

console.log("\n=== G30 time_of_day — top 5 hours ===");
const tod = await sql<{ hour_of_day: number; weekday: number; event_count: string }[]>`
  SELECT hour_of_day, weekday, sum(event_count)::text AS event_count
  FROM public.event_log_time_of_day
  GROUP BY hour_of_day, weekday
  ORDER BY sum(event_count) DESC LIMIT 5
`;
for (const r of tod) {
  const dows = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  console.log(`  ${String(r.hour_of_day).padStart(2,"0")}:00 ${dows[r.weekday]} · ${r.event_count} events`);
}

await sql.end();
