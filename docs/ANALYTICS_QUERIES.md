# Analytics queries — cookbook

A reference for the views/functions installed in migrations 0002–0003.
Each query block has the same shape:

> **Q:** the research question (English).
> **Why this works:** the theoretical or design rationale.
> **Reads:** which view/table it touches.
> **Use it for:** which paper / which dashboard.
> **SQL:** copy-pasteable, commented inline.
> **Interpretation:** how to read the output.

Run any of these against Supabase via `psql`, the Supabase SQL Editor, or a
TypeScript helper like:

```bash
npx tsx --env-file=.env.local scripts/verify-phase-a1.ts
```

## Glossary of view shapes

| view / function | grain | columns to know |
|---|---|---|
| `event_log` | one row per event | `user_id`, `session_id`, `cohort_id`, `kind`, `payload_json`, `ts` |
| `event_log_sessions` | one row per (user, session) | `started_at`, `ended_at`, `event_count`, `node_opens`, `comments`, `case_attaches`, `mypath_steps`, `duration_ms` |
| `event_log_node_dwell` | one row per node-open | `node_id`, `dwell_ms` |
| `event_log_bridge_traverse` | one row per cross-domain hop | `from_node`, `to_node`, `from_domain`, `to_domain`, `gap_ms` |
| `event_log_node_revisit` | one row per (user, node) revisited ≥2× | `visit_count`, `revisits`, `sessions_visited` |
| `event_log_bridge_hub_dwell` | one row per (user, session) | `counseling_ms`, `clinical_ms`, `shared_ms`, `shared_ratio` |
| `event_log_backtrack` | one row per within-session backtrack | `from_node_id`, `back_to_node_id`, `gap_ms` |
| `event_log_inter_session_gap` | one row per (user, session_n→n+1) | `gap_hours`, `prev_weekday`, `curr_weekday` |
| `event_log_time_of_day` | one row per (user × hour × weekday) | `event_count`, `node_opens`, `comments` |
| `cohort_engagement_summary` | one row per cohort | `active_users`, `sessions`, `total_events`, `node_opens` |
| `lag_sequential_counts(user_id)` | function returning rows | `prev_kind`, `next_kind`, `n` |
| `lag_sequential_counts_cohort(cohort_id)` | function | `prev_kind`, `next_kind`, `n`, `n_users` |

---

## 1. Quick LAK-style dashboards

### 1.1 — How active is each cohort right now?

> **Q:** Quick health check — which cohorts have learners actually using the tool, and how much?
> **Why:** Onboarding sanity check. If `active_users < cohort_size / 2` after week 1, something's wrong with the deployment.
> **Reads:** `cohort_engagement_summary`
> **Use it for:** weekly status report; LAK paper section "deployment context"

```sql
SELECT
  cohort_id,
  active_users,                       -- distinct users who have ≥1 event
  sessions,                           -- distinct sessionId values
  total_events,
  node_opens,
  comments,
  case_attaches,
  mypath_steps,
  -- Activity "intensity" — events per session
  round((total_events::numeric / NULLIF(sessions, 0))::numeric, 1) AS events_per_session,
  first_event_at,
  last_event_at
FROM cohort_engagement_summary
ORDER BY total_events DESC;
```

> **Interpretation:** `events_per_session > 30` is healthy engagement;
> `< 10` likely means learners log in, glance, log out — a UX problem.

---

### 1.2 — Which time-of-day are learners studying?

> **Q:** Are students using the tool during class hours, after class, or late at night? Day-of-week patterns?
> **Why:** Time-of-day predicts achievement in some prior LAK work (Andres et al.); we want to know if our cohort skews to study-hall or 11pm-cram.
> **Reads:** `event_log_time_of_day`
> **Use it for:** descriptive dashboard, LAK methods paper context.

```sql
-- Heatmap of activity by hour × weekday for one cohort
SELECT
  weekday,                                        -- 0=Sun, 6=Sat
  hour_of_day,
  sum(event_count) AS events,
  sum(sessions)    AS sessions
FROM event_log_time_of_day
WHERE cohort_id = 'pilot_2026'
GROUP BY weekday, hour_of_day
ORDER BY weekday, hour_of_day;
```

> **Interpretation:** Pivot the result into a 7×24 grid in your notebook.
> Diagonals = study habits clusters. A single late-night spike = cram-mode
> cohort; spread distribution = paced learners.

---

## 2. Per-user trajectories (S2 — path signatures)

### 2.1 — A learner's full event timeline

> **Q:** What did this specific learner do, in order, during this session?
> **Why:** Bottom-up trace; ground-truth for any qualitative coding pass.
> **Reads:** `event_log`
> **Use it for:** S2 case studies (3–5 illustrative trajectories per paper).

```sql
SELECT
  ts,
  kind,
  payload_json ->> 'nodeId' AS node_id,
  payload_json
FROM event_log
WHERE user_id    = 'b4b10a99-abb5-440f-bcd3-b2d802f46a2a'
  AND session_id = 'synthetic-3m5miqgh'
ORDER BY ts;
```

> **Interpretation:** Reads top-down. Look for clusters of one event kind
> (deep diving) vs alternation (surveying).

---

### 2.2 — Lag-1 transition matrix for a learner

> **Q:** What's the conditional probability that this learner does X given they just did Y?
> **Why:** Lag-sequential transition matrices are the workhorse of expert-vs-novice analysis (Schegloff, Bakeman & Quera).
> **Reads:** `lag_sequential_counts(user_id)`
> **Use it for:** **S2 dependent measure** — Hellinger distance between expert and novice transition matrices.

```sql
SELECT prev_kind, next_kind, n
FROM lag_sequential_counts('b4b10a99-abb5-440f-bcd3-b2d802f46a2a')
ORDER BY n DESC
LIMIT 20;
```

> **Interpretation:** A novice might show `node_open → node_open → node_open`
> (clicking around aimlessly). An expert might show `node_open → comment_post`
> or `node_open → case_attach` (engagement after surveying).

---

### 2.3 — Cohort-level transition matrix

> **Q:** What's the modal transition for the entire cohort, and how many users contributed each transition?
> **Why:** Filters out idiosyncratic users; reveals shared cognitive sequences.
> **Reads:** `lag_sequential_counts_cohort(cohort_id)`
> **Use it for:** S2 cohort comparison; paper figure showing "expert pattern" vs "novice pattern".

```sql
SELECT prev_kind, next_kind, n, n_users,
       round(n::numeric / n_users, 1) AS avg_per_user
FROM lag_sequential_counts_cohort('pilot_2026')
WHERE n_users >= 3              -- only patterns shown by ≥3 users
ORDER BY n DESC
LIMIT 30;
```

> **Interpretation:** Look for transitions where `n_users` is high (modal)
> vs `avg_per_user` is high (a few power users dominating).

---

### 2.4 — Per-session pacing

> **Q:** How long was each session, and how dense was the activity?
> **Why:** Distinguishes "checked in for 90s" from "studied for 25 min".
> **Reads:** `event_log_sessions`
> **Use it for:** filter pre-condition for any per-session analysis (drop sessions <30s as noise).

```sql
SELECT
  user_id,
  session_id,
  started_at,
  duration_ms / 1000 AS duration_s,
  event_count,
  node_opens,
  comments,
  case_attaches,
  mypath_steps,
  -- events per minute (rough engagement velocity)
  round(event_count::numeric / GREATEST(duration_ms / 60000.0, 1), 2) AS events_per_min
FROM event_log_sessions
WHERE cohort_id = 'pilot_2026'
ORDER BY started_at DESC
LIMIT 50;
```

> **Interpretation:** `events_per_min < 1` ≈ mostly idle (probably tab in
> background); `> 5` = active rapid clicking; sweet spot for analysis is
> 1–3 events per minute (engaged but reflective).

---

### 2.5 — Inter-session gap — daily learners vs cram-mode

> **Q:** Does this learner come back daily, or do they cram in one weekend?
> **Why:** Spaced-practice predicts retention (Bjork). Cram-mode predicts surface learning.
> **Reads:** `event_log_inter_session_gap`
> **Use it for:** S4 longitudinal alignment paper covariate.

```sql
SELECT
  user_id,
  count(*)                                          AS gaps,
  round(avg(gap_hours)::numeric, 1)                 AS avg_gap_hours,
  round(stddev(gap_hours)::numeric, 1)              AS sd_gap_hours,
  -- "regular learner" = small SD; "binge learner" = high SD
  CASE
    WHEN stddev(gap_hours) < 24 THEN 'regular'
    WHEN avg(gap_hours)   < 48 THEN 'engaged_irregular'
    ELSE 'binge'
  END                                               AS pacing_class
FROM event_log_inter_session_gap
WHERE cohort_id = 'pilot_2026'
GROUP BY user_id
ORDER BY gaps DESC;
```

> **Interpretation:** A learner with `pacing_class='regular'` and ≥5 gaps
> has shown daily-cadence behavior. Use as a stratification variable in
> downstream analyses.

---

## 3. Cross-domain identity (C5 — bridge attention)

### 3.1 — Who explores both domains, who silos?

> **Q:** What proportion of each learner's session time is on bridge / shared hubs vs single-domain content?
> **Why:** **Direct C5 measure** — cross-domain attention is the operationalization of "professional identity formation that integrates counseling × clinical".
> **Reads:** `event_log_bridge_hub_dwell` (depends on `event_log_node_dwell`)
> **Use it for:** **C5 paper headline figure**.

```sql
SELECT
  user_id,
  count(*)                                          AS sessions_observed,
  round(avg(shared_ratio)::numeric, 3)              AS avg_shared_ratio,
  round(avg(counseling_ms)::numeric / 1000, 1)      AS avg_counseling_s,
  round(avg(clinical_ms)::numeric / 1000, 1)        AS avg_clinical_s,
  round(avg(shared_ms)::numeric / 1000, 1)          AS avg_shared_s,
  -- Imbalance score: 0 = perfectly balanced, 1 = single-domain
  abs(avg(counseling_ms) - avg(clinical_ms))::float
    / NULLIF(avg(counseling_ms) + avg(clinical_ms), 0)::float AS imbalance
FROM event_log_bridge_hub_dwell
WHERE cohort_id = 'pilot_2026'
GROUP BY user_id
ORDER BY avg_shared_ratio DESC;
```

> **Interpretation:** `avg_shared_ratio > 0.20` = strong bridge-attentive
> learner; `< 0.05` = silo'd. `imbalance` close to 0 = even counseling/clinical
> exposure.

---

### 3.2 — When and how do learners cross domains?

> **Q:** Which bridge edges actually get traversed in practice? Which directions (counseling→clinical or reverse)?
> **Why:** Informs **C1 ontology validation** — bridges that are heavily traversed are likely real, ones never traversed deserve a Delphi look.
> **Reads:** `event_log_bridge_traverse`
> **Use it for:** C1 + C5; deciding which `bridges_to` edges to keep.

```sql
SELECT
  from_domain || ' → ' || to_domain                  AS direction,
  from_node || ' → ' || to_node                      AS edge,
  count(*)                                           AS traversals,
  count(DISTINCT user_id)                            AS distinct_users,
  round(avg(gap_ms)::numeric / 1000, 1)              AS avg_gap_s
FROM event_log_bridge_traverse
WHERE cohort_id = 'pilot_2026'
GROUP BY from_domain, to_domain, from_node, to_node
ORDER BY distinct_users DESC, traversals DESC
LIMIT 20;
```

> **Interpretation:** Edges with high `distinct_users` AND short `avg_gap_s`
> (<10s) are decisive comparisons. Long gaps (>30s) are detours through
> the panel — different cognitive event.

---

## 4. Concept difficulty / consolidation (S2 / S3)

### 4.1 — Which nodes do learners keep coming back to?

> **Q:** Which concepts are revisited most frequently? Aggregated or per-cohort.
> **Why:** Re-visit count is a difficulty / importance proxy. High re-visit + low dwell = "I keep checking this for context"; high re-visit + high dwell = "I keep struggling to understand this".
> **Reads:** `event_log_node_revisit` joined with `core_nodes` for labels.
> **Use it for:** S3 conceptual difficulty rankings; informs curriculum revision.

```sql
SELECT
  r.node_id,
  cn.label_ko,
  cn.domain,
  cn.level,
  sum(r.revisits)              AS total_revisits,
  count(DISTINCT r.user_id)    AS users_who_revisited,
  -- average revisits per user (normalized for cohort size)
  round(sum(r.revisits)::numeric / count(DISTINCT r.user_id)::numeric, 2)
                               AS avg_revisits_per_user
FROM event_log_node_revisit r
JOIN core_nodes cn ON cn.id = r.node_id
WHERE r.cohort_id = 'pilot_2026'
GROUP BY r.node_id, cn.label_ko, cn.domain, cn.level
ORDER BY users_who_revisited DESC, total_revisits DESC
LIMIT 20;
```

> **Interpretation:** A concept revisited by ≥50% of the cohort is a
> "consolidation hotspot". Pair with comment_post density on the same node
> (next query) to disambiguate "I struggle with this" vs "this is central".

---

### 4.2 — Pair revisits with discussion density

> **Q:** Where are learners both re-visiting AND discussing? (Compound
> attention signal.)
> **Why:** A concept that is *both* revisited AND argued about is the natural
> seed for a knowledge-building "rise above" episode.
> **Reads:** `event_log_node_revisit` + `event_log` (comment_post events).
> **Use it for:** S6 KB-event identification.

```sql
WITH commented AS (
  SELECT
    payload_json ->> 'nodeId'      AS node_id,
    count(*)                       AS comments_n,
    count(DISTINCT user_id)        AS commenters
  FROM event_log
  WHERE kind      = 'comment_post'
    AND cohort_id = 'pilot_2026'
  GROUP BY payload_json ->> 'nodeId'
)
SELECT
  cn.label_ko,
  cn.domain,
  COALESCE(rv.users_who_revisited, 0)  AS revisitors,
  COALESCE(c.commenters, 0)            AS commenters,
  COALESCE(rv.total_revisits, 0)       AS revisits,
  COALESCE(c.comments_n, 0)            AS comments
FROM core_nodes cn
LEFT JOIN (
  SELECT node_id, sum(revisits) AS total_revisits, count(DISTINCT user_id) AS users_who_revisited
  FROM event_log_node_revisit
  WHERE cohort_id = 'pilot_2026'
  GROUP BY node_id
) rv  ON rv.node_id = cn.id
LEFT JOIN commented c ON c.node_id = cn.id
WHERE COALESCE(rv.users_who_revisited, 0) + COALESCE(c.commenters, 0) > 0
ORDER BY (COALESCE(rv.users_who_revisited, 0) + COALESCE(c.commenters, 0)) DESC
LIMIT 20;
```

> **Interpretation:** Top rows = **knowledge-building hotspots**. Use as the
> pre-screening filter before qualitative coding — focus IRR effort on these
> 10–20 nodes instead of all 214.

---

### 4.3 — Backtrack hotspots — where are learners getting lost?

> **Q:** Which nodes do learners click into and immediately back out of (within 5s)?
> **Why:** A quick in-and-out is "wrong turn" navigation. High backtrack count = bad UX or unclear concept positioning.
> **Reads:** `event_log_backtrack`
> **Use it for:** UX iteration; LAK short paper "graph-affordance redesign loop".

```sql
SELECT
  back_to_node_id           AS landed_on,
  cn.label_ko,
  cn.domain,
  count(*)                  AS backtrack_count,
  count(DISTINCT user_id)   AS distinct_users,
  round(avg(gap_ms)::numeric, 0) AS avg_gap_ms
FROM event_log_backtrack b
JOIN core_nodes cn ON cn.id = b.back_to_node_id
WHERE cohort_id = 'pilot_2026'
GROUP BY back_to_node_id, cn.label_ko, cn.domain
ORDER BY distinct_users DESC, backtrack_count DESC
LIMIT 10;
```

> **Interpretation:** If a top-hub appears in this list with high
> `distinct_users`, learners are mistakenly clicking it (probably from
> visual clutter). Re-design candidate.

---

## 5. Dwell time analytics (S2 — path signatures, S3 — case anchoring)

### 5.1 — Distribution of dwell times — describing reading behavior

> **Q:** How long do learners spend on each node before moving on?
> **Why:** Foundational descriptor for any time-normalized metric. Skewed distribution = expected; bimodal = two reading modes.
> **Reads:** `event_log_node_dwell`
> **Use it for:** S2 methods section; defining "deep read" threshold.

```sql
SELECT
  cohort_id,
  count(*)                                              AS n,
  percentile_cont(0.10) WITHIN GROUP (ORDER BY dwell_ms)::int  AS p10_ms,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY dwell_ms)::int  AS p25_ms,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY dwell_ms)::int  AS median_ms,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY dwell_ms)::int  AS p75_ms,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY dwell_ms)::int  AS p90_ms,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY dwell_ms)::int  AS p99_ms
FROM event_log_node_dwell
WHERE dwell_ms IS NOT NULL
  AND dwell_ms < 10 * 60 * 1000     -- exclude tab-blur outliers >10 min
GROUP BY cohort_id;
```

> **Interpretation:** Use `p25` as your "skim" cutoff and `p75` as your
> "deep-read" cutoff for downstream classification. Values between are
> "engaged reading".

---

### 5.2 — Per-user mean dwell — engagement profile

> **Q:** Does this learner skim or deeply read?
> **Why:** Stable trait across sessions; predicts S2 expert classification (experts often skim more efficiently).
> **Reads:** `event_log_node_dwell`
> **Use it for:** S2 covariate; binary expert/novice flag.

```sql
SELECT
  user_id,
  cohort_id,
  count(*)                                  AS node_opens,
  round(avg(dwell_ms))                      AS mean_dwell_ms,
  round(stddev(dwell_ms))                   AS sd_dwell_ms,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY dwell_ms)::int AS median_dwell_ms
FROM event_log_node_dwell
WHERE dwell_ms IS NOT NULL
  AND dwell_ms BETWEEN 500 AND 10*60*1000
GROUP BY user_id, cohort_id
HAVING count(*) >= 10                       -- need enough data points
ORDER BY median_dwell_ms DESC;
```

---

## 6. S5 Mirror Mode prep — already-derivable signals

> Note: Mirror Mode requires client-side emitters G1–G3 / G25–G27 to truly
> shine. But here's what's already computable from existing event_log.

### 6.1 — Path-alignment trajectory across sessions

> **Q:** Does this learner's mypath get more or less aligned to expert paths over their semester?
> **Why:** S5 dependent variable preview; S4 longitudinal evidence.
> **Reads:** `event_log` (mypath_step events) + `learning_paths` (expert references) + the alignment functions in `src/client/lib/alignment.ts` re-implemented in SQL.
> **Use it for:** S5/S4 trajectory plots.

```sql
-- For each session, compute how many distinct expert seed nodes were touched
-- by the learner's mypath (a coarse Jaccard-style proxy).
WITH mypath_per_session AS (
  SELECT
    user_id, session_id, cohort_id,
    array_agg(payload_json ->> 'nodeId' ORDER BY ts) AS my_nodes
  FROM event_log
  WHERE kind = 'mypath_step' AND user_id <> 'anon'
  GROUP BY user_id, session_id, cohort_id
),
expert_nodes AS (
  SELECT DISTINCT jsonb_array_elements_text(node_sequence_json) AS node_id
  FROM learning_paths
  WHERE kind = 'seeded_template'
)
SELECT
  m.user_id,
  m.session_id,
  array_length(m.my_nodes, 1)                                                AS my_path_len,
  (
    SELECT count(DISTINCT n) FROM unnest(m.my_nodes) n
    WHERE n IN (SELECT node_id FROM expert_nodes)
  )                                                                          AS overlap_with_expert,
  round(
    (SELECT count(DISTINCT n) FROM unnest(m.my_nodes) n WHERE n IN (SELECT node_id FROM expert_nodes))::numeric
    / GREATEST(array_length(m.my_nodes, 1), 1)::numeric,
    2
  )                                                                          AS overlap_ratio
FROM mypath_per_session m
WHERE m.cohort_id = 'pilot_2026'
ORDER BY m.user_id, m.session_id;
```

> **Interpretation:** Plot `overlap_ratio` over `session_n` per user.
> Increasing trend = expert convergence (S4 finding); flat = no learning;
> decreasing = drift.

---

## 7. Session-level cohort summaries (LAK dashboards)

### 7.1 — Daily activity over time

> **Q:** What does the daily volume look like for a cohort?
> **Why:** Engagement curve — time-on-tool over the semester. Signals the natural midterm spike, end-of-term cram, etc.
> **Reads:** `event_log`
> **Use it for:** dashboard chart.

```sql
SELECT
  date_trunc('day', ts)::date    AS day,
  count(*)                       AS events,
  count(DISTINCT user_id)        AS active_users,
  count(DISTINCT session_id)     AS sessions
FROM event_log
WHERE user_id <> 'anon'
  AND cohort_id = 'pilot_2026'
GROUP BY date_trunc('day', ts)
ORDER BY day;
```

---

### 7.2 — Engagement funnel

> **Q:** Of all learners in the cohort, how many got past each milestone?
> **Why:** Standard LAK funnel; identifies drop-off points.
> **Reads:** `event_log_sessions` + base counts.
> **Use it for:** dashboard "we lost N learners at step X".

```sql
WITH cohort_users AS (
  SELECT id FROM users WHERE cohort_id = 'pilot_2026' AND role = 'student'
),
metrics AS (
  SELECT
    s.user_id,
    sum(s.event_count)            AS total_events,
    sum(s.node_opens)             AS total_node_opens,
    sum(s.comments)               AS total_comments,
    sum(s.case_attaches)          AS total_cases,
    sum(s.mypath_steps)           AS total_mypath
  FROM event_log_sessions s
  WHERE s.cohort_id = 'pilot_2026'
  GROUP BY s.user_id
)
SELECT
  count(*)                                                AS enrolled,
  count(*) FILTER (WHERE m.total_events     > 0)          AS ever_logged_in,
  count(*) FILTER (WHERE m.total_node_opens >= 5)         AS opened_5_nodes,
  count(*) FILTER (WHERE m.total_comments   >= 1)         AS posted_once,
  count(*) FILTER (WHERE m.total_cases      >= 1)         AS attached_case,
  count(*) FILTER (WHERE m.total_mypath     >= 5)         AS recorded_path
FROM cohort_users cu
LEFT JOIN metrics m ON m.user_id = cu.id;
```

---

## 8. Process-mining export (EDM submission prep)

### 8.1 — XES-friendly event log dump

> **Q:** Export the event_log as a flat per-event table that PM4Py / ProM can ingest.
> **Why:** Process-mining tools want `case_id`, `activity`, `timestamp` columns. Map our (user, session) → case_id.
> **Reads:** `event_log`
> **Use it for:** S2 process-mining paper export.

```sql
COPY (
  SELECT
    user_id || '__' || session_id  AS case_id,
    kind                           AS activity,
    ts                             AS timestamp_,
    payload_json ->> 'nodeId'      AS resource,
    cohort_id                      AS context_cohort
  FROM event_log
  WHERE user_id <> 'anon'
    AND cohort_id = 'pilot_2026'
  ORDER BY user_id, session_id, ts
) TO '/tmp/process-mining-export.csv' WITH CSV HEADER;
```

> **Interpretation:** Open in PM4Py with
> `pm4py.read_csv(..., case_id_key='case_id', activity_key='activity', timestamp_key='timestamp_')`.

---

## 9. Health-checks (run weekly)

### 9.1 — Did event-collection break?

> **Q:** Are events still landing? Are user_ids being stamped correctly?
> **Why:** Catch a regression in the auth middleware before we lose a week of data.
> **Reads:** `event_log`.
> **Use it for:** weekly cron / manual check.

```sql
SELECT
  date_trunc('hour', ts) AS hour,
  count(*)                                                  AS events,
  count(*) FILTER (WHERE user_id = 'anon')                  AS anon_events,
  count(*) FILTER (WHERE cohort_id IS NULL AND user_id <> 'anon') AS missing_cohort,
  count(*) FILTER (WHERE payload_json IS NULL)              AS null_payloads
FROM event_log
WHERE ts > now() - interval '7 days'
GROUP BY date_trunc('hour', ts)
ORDER BY hour DESC
LIMIT 48;
```

> **Interpretation:** A sudden spike in `anon_events` after a deploy = client
> auth wiring broke. A spike in `missing_cohort` = a user was created
> without `user_metadata.cohort_id` set.

---

### 9.2 — Inventory checkpoint — are derived views still healthy?

> **Q:** Confirm all 9 analytic views return non-error and have rows.
> **Why:** A schema migration could break a view without anyone noticing until paper time.

```sql
SELECT 'cohort_engagement_summary'        AS view, count(*) AS n FROM cohort_engagement_summary
UNION ALL SELECT 'event_log_sessions',          count(*) FROM event_log_sessions
UNION ALL SELECT 'event_log_node_dwell',        count(*) FROM event_log_node_dwell
UNION ALL SELECT 'event_log_bridge_traverse',   count(*) FROM event_log_bridge_traverse
UNION ALL SELECT 'event_log_backtrack',         count(*) FROM event_log_backtrack
UNION ALL SELECT 'event_log_node_revisit',      count(*) FROM event_log_node_revisit
UNION ALL SELECT 'event_log_bridge_hub_dwell',  count(*) FROM event_log_bridge_hub_dwell
UNION ALL SELECT 'event_log_inter_session_gap', count(*) FROM event_log_inter_session_gap
UNION ALL SELECT 'event_log_time_of_day',       count(*) FROM event_log_time_of_day
ORDER BY n DESC;
```

---

## 10. Notebook-friendly TypeScript helpers

For when you'd rather work in TypeScript than SQL — drop these into a new
`scripts/<analysis>.ts`:

```typescript
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

// Per-cohort engagement
const eng = await sql`SELECT * FROM cohort_engagement_summary
                      WHERE cohort_id = ${"pilot_2026"}`;

// Per-user lag-sequential
const lag = await sql`SELECT * FROM lag_sequential_counts(${userId}) LIMIT 50`;

// Cross-domain attention summary
const c5 = await sql`
  SELECT user_id, avg(shared_ratio) AS bridge_focus
  FROM event_log_bridge_hub_dwell
  WHERE cohort_id = ${"pilot_2026"}
  GROUP BY user_id ORDER BY bridge_focus DESC`;

await sql.end();
```

Run with `npx tsx --env-file=.env.local scripts/your-analysis.ts`.

---

## 11. Cookbook patterns — common composition shapes

### 11a. "Per user × session" — the workhorse pattern

Always partition by `(user_id, session_id)` because:
- One human can have multiple sessions (different days)
- A session is the natural unit of cognitive work

```sql
SELECT user_id, session_id, /* ... */
FROM event_log
WHERE user_id <> 'anon'           -- always filter anon
GROUP BY user_id, session_id;
```

### 11b. Window functions for lag/lead

```sql
SELECT
  user_id, ts, kind,
  lag(kind) OVER (PARTITION BY user_id, session_id ORDER BY ts)  AS prev_kind,
  lead(ts)  OVER (PARTITION BY user_id, session_id ORDER BY ts)  AS next_ts,
  EXTRACT(EPOCH FROM (
    lead(ts) OVER (PARTITION BY user_id, session_id ORDER BY ts) - ts
  )) * 1000 AS ms_until_next
FROM event_log
WHERE user_id <> 'anon';
```

### 11c. Cross-table joins to enrich payload

```sql
-- Resolve nodeId in payload to its label and domain
SELECT
  e.ts, e.kind,
  cn.label_ko, cn.domain, cn.level
FROM event_log e
JOIN core_nodes cn ON cn.id = e.payload_json ->> 'nodeId'
WHERE e.kind = 'node_open';
```

### 11d. JSON path extraction patterns

| extract | syntax |
|---|---|
| string | `payload_json ->> 'nodeId'` |
| object | `payload_json -> 'nested'` |
| nested string | `payload_json -> 'nested' ->> 'key'` |
| number | `(payload_json ->> 'count')::int` |

---

## 12. What this cookbook deliberately doesn't include

- **Statistical models per paper.** Those go in the OSF preregistration per
  study; this doc is descriptive/exploratory.
- **Visualizations.** Use Supabase Studio's chart builder, or pull into
  Pandas/R from the COPY-CSV exports.
- **Real-time analytics.** Phase B feature — the dashboard for instructors
  to see live cohort state. Out of scope here.

---

*Last updated 2026-04-28. View shapes valid for migrations 0000–0003.*
