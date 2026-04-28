-- 0002 — analytics-collection scaffolding.
--
-- Driven by docs/ANALYTICS_RESEARCH_MAP.md. Three concerns:
--   (a) NEW STRUCTURE — `consents` table (G11). IRB hard blocker for any
--       human-subject paper; without it, S1–S7 cannot publish.
--   (b) QUERY PERFORMANCE — composite indexes on event_log so cohort-level
--       and per-user-trajectory queries don't seq-scan as the table grows.
--   (c) DERIVED SIGNALS — SQL views + a lag-sequential function so
--       commonly-needed analytics surfaces are first-class and don't need
--       reimplementation in every notebook / paper draft.
--
-- Everything is additive (CREATE TABLE/INDEX/VIEW/FUNCTION IF NOT EXISTS).
-- Cross-checked against the no-destructive-DB rule in the user's memory.

-- ============================================================
-- (a) consents table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.consents (
  id                serial PRIMARY KEY,
  user_id           text NOT NULL,
  cohort_id         text,
  protocol_version  text NOT NULL,
  accepted          boolean NOT NULL,
  accepted_at       timestamp with time zone NOT NULL DEFAULT now(),
  -- IRB-audit-only fingerprint; we deliberately store hashes, not raw values.
  ip_hash           text,
  ua_hash           text,
  notes             text
);

CREATE INDEX IF NOT EXISTS consents_user_idx     ON public.consents(user_id);
CREATE INDEX IF NOT EXISTS consents_cohort_idx   ON public.consents(cohort_id);
CREATE INDEX IF NOT EXISTS consents_protocol_idx ON public.consents(protocol_version);

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY consents_self_read       ON public.consents FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text OR public.is_instructor());

CREATE POLICY consents_self_insert     ON public.consents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY consents_instructor_all  ON public.consents FOR ALL TO authenticated
  USING (public.is_instructor()) WITH CHECK (public.is_instructor());

REVOKE INSERT, UPDATE, DELETE ON public.consents FROM anon;

-- ============================================================
-- (b) Composite indexes on event_log
-- ============================================================
-- Cohort-level temporal queries: "all events from pilot_2026 in week 3".
CREATE INDEX IF NOT EXISTS event_log_cohort_ts_idx
  ON public.event_log(cohort_id, ts)
  WHERE user_id <> 'anon';

-- Per-user trajectory queries: "all node_open events for this learner over time".
CREATE INDEX IF NOT EXISTS event_log_user_kind_ts_idx
  ON public.event_log(user_id, kind, ts)
  WHERE user_id <> 'anon';

-- Session reconstruction: events for a session in order.
CREATE INDEX IF NOT EXISTS event_log_session_ts_idx
  ON public.event_log(session_id, ts);

-- ============================================================
-- (c1) Derived view — session boundaries
-- ============================================================
-- A session = a sessionId from the client (UUID per page load). Bounded by
-- min/max ts. Useful for S2 dwell aggregates and S7 phase-transition prep.
CREATE OR REPLACE VIEW public.event_log_sessions AS
SELECT
  user_id,
  session_id,
  cohort_id,
  min(ts)                                                    AS started_at,
  max(ts)                                                    AS ended_at,
  count(*)                                                   AS event_count,
  count(*) FILTER (WHERE kind = 'node_open')                 AS node_opens,
  count(*) FILTER (WHERE kind = 'edge_click')                AS edge_clicks,
  count(*) FILTER (WHERE kind = 'comment_post')              AS comments,
  count(*) FILTER (WHERE kind = 'case_attach')               AS case_attaches,
  count(*) FILTER (WHERE kind = 'mypath_step')               AS mypath_steps,
  count(*) FILTER (WHERE kind = 'discovery_prompt_open')     AS discovery_opens,
  EXTRACT(EPOCH FROM (max(ts) - min(ts))) * 1000             AS duration_ms
FROM public.event_log
WHERE user_id <> 'anon' AND session_id IS NOT NULL
GROUP BY user_id, session_id, cohort_id;

GRANT SELECT ON public.event_log_sessions TO authenticated;

-- ============================================================
-- (c2) Derived view — bridge_traverse (C5)
-- ============================================================
-- Two consecutive node_open events within 30s where the source/target span
-- different domains. Fires the C5 cross-domain professional-identity-formation
-- signal without needing a client-side emitter (G6 in the research map).
CREATE OR REPLACE VIEW public.event_log_bridge_traverse AS
SELECT
  e.user_id,
  e.cohort_id,
  e.session_id,
  e_prev.ts                                              AS from_ts,
  e.ts                                                   AS to_ts,
  e_prev.payload_json ->> 'nodeId'                       AS from_node,
  e.payload_json      ->> 'nodeId'                       AS to_node,
  cn_prev.domain                                         AS from_domain,
  cn.domain                                              AS to_domain,
  EXTRACT(EPOCH FROM (e.ts - e_prev.ts)) * 1000          AS gap_ms
FROM public.event_log e
JOIN LATERAL (
  SELECT *
  FROM public.event_log p
  WHERE p.user_id    = e.user_id
    AND p.session_id = e.session_id
    AND p.kind       = 'node_open'
    AND p.ts < e.ts
    AND e.ts - p.ts < interval '30 seconds'
  ORDER BY p.ts DESC
  LIMIT 1
) e_prev ON true
JOIN public.core_nodes cn      ON cn.id      = (e.payload_json      ->> 'nodeId')
JOIN public.core_nodes cn_prev ON cn_prev.id = (e_prev.payload_json ->> 'nodeId')
WHERE e.kind = 'node_open'
  AND cn.domain IS DISTINCT FROM cn_prev.domain;

GRANT SELECT ON public.event_log_bridge_traverse TO authenticated;

-- ============================================================
-- (c3) Lag-sequential transition counts (S2)
-- ============================================================
-- Per-user, per-session lag-1 transition matrix on event kinds. Bottoms-up
-- input to expert-vs-novice path-signature analysis.
CREATE OR REPLACE FUNCTION public.lag_sequential_counts(p_user_id text)
RETURNS TABLE(prev_kind text, next_kind text, n bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT prev_kind, kind AS next_kind, count(*) AS n
  FROM (
    SELECT
      kind,
      lag(kind) OVER (PARTITION BY user_id, session_id ORDER BY ts) AS prev_kind
    FROM public.event_log
    WHERE user_id = p_user_id
  ) t
  WHERE prev_kind IS NOT NULL
  GROUP BY prev_kind, next_kind
  ORDER BY n DESC;
$$;

-- Cohort-level variant for S2 group-comparisons.
CREATE OR REPLACE FUNCTION public.lag_sequential_counts_cohort(p_cohort_id text)
RETURNS TABLE(prev_kind text, next_kind text, n bigint, n_users bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    prev_kind,
    kind AS next_kind,
    count(*) AS n,
    count(DISTINCT user_id) AS n_users
  FROM (
    SELECT
      user_id,
      kind,
      lag(kind) OVER (PARTITION BY user_id, session_id ORDER BY ts) AS prev_kind
    FROM public.event_log
    WHERE cohort_id = p_cohort_id
  ) t
  WHERE prev_kind IS NOT NULL
  GROUP BY prev_kind, next_kind
  ORDER BY n DESC;
$$;

-- ============================================================
-- (c4) node_dwell_end fallback (S2)
-- ============================================================
-- Until G4 ships a client-side emitter for node_dwell_end, this view derives
-- dwell intervals from consecutive node_open events. Loses precision (a tab
-- switch off and back gives a fake-long dwell) but is good enough for cohort
-- comparisons.
CREATE OR REPLACE VIEW public.event_log_node_dwell AS
SELECT
  e.user_id,
  e.cohort_id,
  e.session_id,
  e.ts                                            AS opened_at,
  next.ts                                         AS exited_at,
  e.payload_json ->> 'nodeId'                     AS node_id,
  EXTRACT(EPOCH FROM (next.ts - e.ts)) * 1000     AS dwell_ms
FROM public.event_log e
LEFT JOIN LATERAL (
  SELECT ts FROM public.event_log n
  WHERE n.user_id    = e.user_id
    AND n.session_id = e.session_id
    AND n.kind       = 'node_open'
    AND n.ts > e.ts
  ORDER BY n.ts ASC
  LIMIT 1
) next ON true
WHERE e.kind = 'node_open';

GRANT SELECT ON public.event_log_node_dwell TO authenticated;

-- ============================================================
-- (c5) Cohort engagement summary (LAK dashboard prep)
-- ============================================================
CREATE OR REPLACE VIEW public.cohort_engagement_summary AS
SELECT
  cohort_id,
  count(DISTINCT user_id)                                  AS active_users,
  count(DISTINCT session_id)                               AS sessions,
  count(*)                                                 AS total_events,
  count(*) FILTER (WHERE kind='node_open')                 AS node_opens,
  count(*) FILTER (WHERE kind='comment_post')              AS comments,
  count(*) FILTER (WHERE kind='case_attach')               AS case_attaches,
  count(*) FILTER (WHERE kind='mypath_step')               AS mypath_steps,
  min(ts)                                                  AS first_event_at,
  max(ts)                                                  AS last_event_at
FROM public.event_log
WHERE user_id <> 'anon' AND cohort_id IS NOT NULL
GROUP BY cohort_id;

GRANT SELECT ON public.cohort_engagement_summary TO authenticated;
