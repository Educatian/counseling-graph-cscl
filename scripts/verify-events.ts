import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");

const sql = postgres(url, { prepare: false, max: 1 });
const rows = await sql<{
  id: number;
  user_id: string | null;
  session_id: string | null;
  cohort_id: string | null;
  kind: string;
  payload_json: unknown;
  ts: Date;
}[]>`
  SELECT id, user_id, session_id, cohort_id, kind, payload_json, ts
  FROM event_log
  ORDER BY id DESC
  LIMIT 5
`;
for (const r of rows) console.log(JSON.stringify(r));
await sql.end();
