/**
 * One-off synthetic event generator to prove Phase A.1 views populate.
 * Emits a realistic micro-session for the instructor user:
 *   counseling:human_development (open, dwell)
 *   shared:problem (bridge step)
 *   clinical:psychopathology (cross-domain bridge)
 *   counseling:problem_areas (backtrack-into-counseling)
 *   counseling:human_development (revisit — should fire G19)
 * All ts staggered by 2–4 seconds so dwell + bridge_traverse + backtrack +
 * revisit all become non-empty without being all simultaneous.
 *
 * NOTE: Uses service_role key to bypass RLS on event_log inserts (the user's
 * actual JWT would also work, but this avoids the auth-token round-trip).
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");

const INSTRUCTOR_UID = "b4b10a99-abb5-440f-bcd3-b2d802f46a2a";
const SESSION = "synthetic-" + Math.random().toString(36).slice(2, 10);
const COHORT = "pilot_2026";

// node IDs match real nodes in core_nodes
const SEQ: Array<{ node: string; gapMs: number }> = [
  { node: "c_human_development",          gapMs: 0 },
  { node: "s_problem",                    gapMs: 4200 },   // 4.2s dwell on prev
  { node: "cl_psychopathology",           gapMs: 3100 },   // bridge_traverse: shared→clinical
  { node: "c_problem_areas",              gapMs: 2700 },   // bridge_traverse: clinical→counseling
  { node: "c_human_development",          gapMs: 1800 },   // revisit + backtrack (within 5s)
  { node: "c_problem_areas",              gapMs: 3400 }    // re-visit again
];

const sql = postgres(url, { prepare: false, max: 1 });

let cumulativeMs = 0;
const startTs = Date.now() - SEQ.reduce((s, x) => s + x.gapMs, 0) - 1000;

for (const step of SEQ) {
  cumulativeMs += step.gapMs;
  const ts = new Date(startTs + cumulativeMs);
  const payload = JSON.stringify({ nodeId: step.node, level: "top_hub", via: "synthetic" });
  await sql`
    INSERT INTO public.event_log (user_id, session_id, cohort_id, kind, payload_json, ts)
    VALUES (
      ${INSTRUCTOR_UID},
      ${SESSION},
      ${COHORT},
      'node_open',
      ${payload}::jsonb,
      ${ts}
    )
  `;
  console.log(`  emit node_open ${step.node} @ ${ts.toISOString()}`);
}
console.log(`session: ${SESSION}`);
await sql.end();
