import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");

const sql = postgres(url, { prepare: false, max: 1 });
const rows = await sql<{ ts: string; user_id: string; cohort_id: string | null; kind: string; payload_json: unknown }[]>`
  SELECT ts, user_id, cohort_id, kind, payload_json
  FROM event_log
  WHERE ts > now() - interval '30 minutes'
  ORDER BY ts DESC LIMIT 15
`;
console.log(`recent rows (last 30 min): ${rows.length}`);
for (const r of rows) {
  console.log(`  ${r.ts}  ${r.user_id.slice(0, 8)}…  ${r.cohort_id ?? "(null)"}  ${r.kind}`);
}
await sql.end();
