-- 0003 — micro-analytics Phase A.1 (server-side derivations only).
--
-- Per docs/MICRO_ANALYTICS_PROPOSALS.md §2 "Suggested rollout phases".
-- Zero client work; runs against existing event_log immediately. Each view is
-- a pure read; no row-volume cost. Safe to ship before IRB consent flow lands
-- because the underlying event_log rows already exist under the current
-- consent posture.
--
-- Adds:
--   - cohorts.micro_analytics_level    (gates Phase A.2+ client emitters)
--   - event_log_backtrack              (G16 — within-session backtrack to prior node)
--   - event_log_node_revisit           (G19 — re-visits across all sessions)
--   - event_log_bridge_hub_dwell       (G20 — counseling/clinical/shared dwell ratio per session)
--   - event_log_inter_session_gap      (G29 — gap_hours between successive sessions per user)
--   - event_log_time_of_day            (G30 — hour-of-day × weekday × cohort distribution)

-- ============================================================
-- (0) cohort-level micro-analytics flag
-- ============================================================
ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS micro_analytics_level text NOT NULL DEFAULT 'off';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cohorts_micro_analytics_level_chk'
  ) THEN
    ALTER TABLE public.cohorts
      ADD CONSTRAINT cohorts_micro_analytics_level_chk
      CHECK (micro_analytics_level IN ('off','basic','full'));
  END IF;
END $$;

-- ============================================================
-- (G16) event_log_backtrack
-- ============================================================
-- A backtrack = consecutive node_open events within 5 seconds where the
-- target node was already visited earlier in the same session. Indicates
-- exploratory rollback / debugging-style cognition.
CREATE OR REPLACE VIEW public.event_log_backtrack AS
WITH ordered AS (
  SELECT
    user_id,
    session_id,
    cohort_id,
    ts,
    payload_json ->> 'nodeId'                                                  AS node_id,
    lag(ts)                       OVER w                                       AS prev_ts,
    lag(payload_json ->> 'nodeId') OVER w                                      AS prev_node_id,
    row_number()                  OVER w                                       AS step_n
  FROM public.event_log
  WHERE kind = 'node_open' AND user_id <> 'anon'
  WINDOW w AS (PARTITION BY user_id, session_id ORDER BY ts)
)
SELECT
  o.user_id,
  o.cohort_id,
  o.session_id,
  o.prev_ts                                            AS from_ts,
  o.ts                                                 AS back_to_ts,
  o.prev_node_id                                       AS from_node_id,
  o.node_id                                            AS back_to_node_id,
  EXTRACT(EPOCH FROM (o.ts - o.prev_ts)) * 1000        AS gap_ms
FROM ordered o
WHERE o.prev_ts IS NOT NULL
  AND o.ts - o.prev_ts < interval '5 seconds'
  AND EXISTS (
    SELECT 1 FROM ordered earlier
    WHERE earlier.user_id    = o.user_id
      AND earlier.session_id = o.session_id
      AND earlier.node_id    = o.node_id
      AND earlier.step_n     < o.step_n - 1
  );

GRANT SELECT ON public.event_log_backtrack TO authenticated;

-- ============================================================
-- (G19) event_log_node_revisit
-- ============================================================
-- One row per (user, node) pair where the user visited the node ≥2 times
-- (across any session). Re-visits = consolidation behavior signal.
CREATE OR REPLACE VIEW public.event_log_node_revisit AS
SELECT
  user_id,
  cohort_id,
  payload_json ->> 'nodeId'                AS node_id,
  count(*)                                 AS visit_count,
  count(*) - 1                             AS revisits,
  count(DISTINCT session_id)               AS sessions_visited,
  min(ts)                                  AS first_visit_at,
  max(ts)                                  AS last_visit_at
FROM public.event_log
WHERE kind = 'node_open' AND user_id <> 'anon'
GROUP BY user_id, cohort_id, payload_json ->> 'nodeId'
HAVING count(*) > 1;

GRANT SELECT ON public.event_log_node_revisit TO authenticated;

-- ============================================================
-- (G20) event_log_bridge_hub_dwell
-- ============================================================
-- Per-session dwell time partitioned by domain. shared_ratio is the C5
-- cross-domain identity proxy: how much of this session was on bridge nodes?
-- Builds on event_log_node_dwell from migration 0002.
CREATE OR REPLACE VIEW public.event_log_bridge_hub_dwell AS
SELECT
  d.user_id,
  d.cohort_id,
  d.session_id,
  sum(d.dwell_ms) FILTER (WHERE cn.domain = 'counseling')                       AS counseling_ms,
  sum(d.dwell_ms) FILTER (WHERE cn.domain = 'clinical')                         AS clinical_ms,
  sum(d.dwell_ms) FILTER (WHERE cn.domain = 'shared')                           AS shared_ms,
  sum(d.dwell_ms)                                                               AS total_ms,
  CASE WHEN sum(d.dwell_ms) > 0
    THEN (sum(d.dwell_ms) FILTER (WHERE cn.domain = 'shared'))::float
         / NULLIF(sum(d.dwell_ms), 0)::float
    ELSE 0 END                                                                  AS shared_ratio,
  count(*) FILTER (WHERE cn.domain = 'counseling')                              AS counseling_visits,
  count(*) FILTER (WHERE cn.domain = 'clinical')                                AS clinical_visits,
  count(*) FILTER (WHERE cn.domain = 'shared')                                  AS shared_visits
FROM public.event_log_node_dwell d
JOIN public.core_nodes cn ON cn.id = d.node_id
WHERE d.dwell_ms IS NOT NULL
GROUP BY d.user_id, d.cohort_id, d.session_id;

GRANT SELECT ON public.event_log_bridge_hub_dwell TO authenticated;

-- ============================================================
-- (G29) event_log_inter_session_gap
-- ============================================================
-- For each user, time between successive sessions. Daily-cadence vs
-- cram-mode learners have different outcome trajectories (S4 longitudinal).
CREATE OR REPLACE VIEW public.event_log_inter_session_gap AS
WITH sessions AS (
  SELECT
    user_id,
    cohort_id,
    session_id,
    min(ts)                                                                     AS started_at,
    row_number() OVER (PARTITION BY user_id ORDER BY min(ts))                   AS session_n
  FROM public.event_log
  WHERE user_id <> 'anon' AND session_id IS NOT NULL
  GROUP BY user_id, cohort_id, session_id
)
SELECT
  curr.user_id,
  curr.cohort_id,
  prev.session_id                                                               AS prev_session_id,
  curr.session_id                                                               AS curr_session_id,
  prev.session_n                                                                AS prev_n,
  curr.session_n                                                                AS curr_n,
  prev.started_at                                                               AS prev_started_at,
  curr.started_at                                                               AS curr_started_at,
  EXTRACT(EPOCH FROM (curr.started_at - prev.started_at)) / 3600.0              AS gap_hours,
  EXTRACT(DOW FROM prev.started_at)::int                                        AS prev_weekday,
  EXTRACT(DOW FROM curr.started_at)::int                                        AS curr_weekday
FROM sessions curr
JOIN sessions prev
  ON prev.user_id = curr.user_id
 AND prev.session_n = curr.session_n - 1;

GRANT SELECT ON public.event_log_inter_session_gap TO authenticated;

-- ============================================================
-- (G30) event_log_time_of_day
-- ============================================================
-- Hour-of-day × weekday × cohort distribution. Time-of-day predicts
-- achievement in some prior LAK work; novel for counseling-ed.
CREATE OR REPLACE VIEW public.event_log_time_of_day AS
SELECT
  user_id,
  cohort_id,
  EXTRACT(HOUR FROM ts)::int                                                    AS hour_of_day,
  EXTRACT(DOW FROM ts)::int                                                     AS weekday,
  count(*)                                                                      AS event_count,
  count(DISTINCT session_id)                                                    AS sessions,
  count(*) FILTER (WHERE kind = 'node_open')                                    AS node_opens,
  count(*) FILTER (WHERE kind = 'comment_post')                                 AS comments
FROM public.event_log
WHERE user_id <> 'anon'
GROUP BY user_id, cohort_id, EXTRACT(HOUR FROM ts), EXTRACT(DOW FROM ts);

GRANT SELECT ON public.event_log_time_of_day TO authenticated;
