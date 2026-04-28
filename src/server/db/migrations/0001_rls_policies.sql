-- RLS policies — defense-in-depth.
--
-- Our Hono server connects via postgres-js with the project's master DB user,
-- which bypasses RLS entirely, so today this migration changes nothing for the
-- server. RLS becomes load-bearing the moment we let any client hit Supabase
-- Postgres directly through @supabase/supabase-js (Phase C: notes, threads,
-- cases). Adding RLS now means we don't have to retrofit a security boundary
-- later under a deadline.
--
-- Roles model (mapped from auth.users.user_metadata.role):
--   anon          — unauth'd visitor; read-only on public ontology only
--   authenticated — student / instructor / expert / researcher (per metadata)
-- Per-row authorship checks read auth.uid() against user_id columns.
--
-- Helper: is_instructor() — true if the calling user has user_metadata.role
-- in ('instructor','researcher'). Researchers get read aggregates; instructors
-- additionally write to ontology + cohort tables in later migrations.

CREATE OR REPLACE FUNCTION public.is_instructor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('instructor','researcher'),
    false
  );
$$;

-- ---------- core ontology: world-readable, instructor-write ----------

ALTER TABLE public.core_nodes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_edges      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_snapshots  ENABLE ROW LEVEL SECURITY;

CREATE POLICY core_nodes_read   ON public.core_nodes      FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY core_edges_read   ON public.core_edges      FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY core_snap_read    ON public.core_snapshots  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY core_nodes_write  ON public.core_nodes      FOR ALL    TO authenticated USING (public.is_instructor()) WITH CHECK (public.is_instructor());
CREATE POLICY core_edges_write  ON public.core_edges      FOR ALL    TO authenticated USING (public.is_instructor()) WITH CHECK (public.is_instructor());
CREATE POLICY core_snap_write   ON public.core_snapshots  FOR ALL    TO authenticated USING (public.is_instructor()) WITH CHECK (public.is_instructor());

-- ---------- cohorts: read-all-authed, instructor-write ----------

ALTER TABLE public.cohorts ENABLE ROW LEVEL SECURITY;
CREATE POLICY cohorts_read   ON public.cohorts FOR SELECT TO authenticated USING (true);
CREATE POLICY cohorts_write  ON public.cohorts FOR ALL    TO authenticated USING (public.is_instructor()) WITH CHECK (public.is_instructor());

-- ---------- users (public.users — *not* auth.users) ----------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- Self-read; instructors can see everyone (for cohort dashboards)
CREATE POLICY users_self_read       ON public.users FOR SELECT TO authenticated USING (id = auth.uid()::text OR public.is_instructor());
CREATE POLICY users_self_upsert     ON public.users FOR INSERT TO authenticated WITH CHECK (id = auth.uid()::text);
CREATE POLICY users_self_update     ON public.users FOR UPDATE TO authenticated USING (id = auth.uid()::text) WITH CHECK (id = auth.uid()::text);
CREATE POLICY users_instructor_all  ON public.users FOR ALL    TO authenticated USING (public.is_instructor()) WITH CHECK (public.is_instructor());

-- ---------- learning_paths ----------

ALTER TABLE public.learning_paths ENABLE ROW LEVEL SECURITY;
-- Read: shared paths visible to all authed; private paths only to author or instructor.
CREATE POLICY lp_read   ON public.learning_paths FOR SELECT TO authenticated
  USING (is_shared = true OR author_id = auth.uid()::text OR public.is_instructor());
CREATE POLICY lp_write  ON public.learning_paths FOR ALL    TO authenticated
  USING (author_id = auth.uid()::text OR public.is_instructor())
  WITH CHECK (author_id = auth.uid()::text OR public.is_instructor());

-- ---------- event_log: append-only own; instructors read cohort ----------

ALTER TABLE public.event_log ENABLE ROW LEVEL SECURITY;
-- Inserts: must match auth.uid() (or anon row from anon client when explicitly tagged).
CREATE POLICY event_log_insert_self ON public.event_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);
-- Reads: own rows + instructors see all.
CREATE POLICY event_log_read_self   ON public.event_log FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text OR public.is_instructor());
-- Updates/deletes: nobody at row level. Append-only telemetry — service_role
-- bypasses for retention/IRB ops.

-- ---------- alignment_scores: own + instructor ----------

ALTER TABLE public.alignment_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY align_read  ON public.alignment_scores FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text OR public.is_instructor());
-- Writes go through service_role from server (S5 Mirror Mode batch); no
-- authenticated insert path needed yet.

-- ---------- discourse_networks: aggregate cache, instructor-only read ----------

ALTER TABLE public.discourse_networks ENABLE ROW LEVEL SECURITY;
CREATE POLICY discourse_read  ON public.discourse_networks FOR SELECT TO authenticated
  USING (public.is_instructor());
-- All writes happen via Python pipeline using service_role; no authenticated path.

-- ---------- Sanity: revoke INSERT/UPDATE/DELETE on public.users from anon ----------
-- (RLS already blocks anon, but a belt + suspenders revoke avoids surprises if
--  someone toggles RLS off accidentally during migration work.)
REVOKE INSERT, UPDATE, DELETE ON public.users        FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.event_log    FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.learning_paths FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.alignment_scores FROM anon;
