-- RLS for Phase C shared-discourse tables.
-- Model: discussion is a COHORT artifact (members read each other's posts);
-- case anchors and reflections are PERSONAL but server-persisted (author + instructor).
-- Cohort identity is read from the JWT (user_metadata.cohort_id).

CREATE OR REPLACE FUNCTION public.current_cohort()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT coalesce(auth.jwt() -> 'user_metadata' ->> 'cohort_id', 'default');
$$;

-- ---------- discussion_posts: cohort-readable, author-writable ----------
ALTER TABLE public.discussion_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY discussion_read ON public.discussion_posts FOR SELECT TO authenticated
  USING (cohort_id = public.current_cohort() OR public.is_instructor());

CREATE POLICY discussion_insert ON public.discussion_posts FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid()::text AND cohort_id = public.current_cohort());

CREATE POLICY discussion_delete ON public.discussion_posts FOR DELETE TO authenticated
  USING (author_id = auth.uid()::text OR public.is_instructor());

-- ---------- case_anchors: self + instructor ----------
ALTER TABLE public.case_anchors ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_read ON public.case_anchors FOR SELECT TO authenticated
  USING (author_id = auth.uid()::text OR public.is_instructor());

CREATE POLICY case_insert ON public.case_anchors FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid()::text);

CREATE POLICY case_update ON public.case_anchors FOR UPDATE TO authenticated
  USING (author_id = auth.uid()::text) WITH CHECK (author_id = auth.uid()::text);

CREATE POLICY case_delete ON public.case_anchors FOR DELETE TO authenticated
  USING (author_id = auth.uid()::text);

-- ---------- reflections: self-insert, self/instructor read ----------
ALTER TABLE public.reflections ENABLE ROW LEVEL SECURITY;

CREATE POLICY reflections_read ON public.reflections FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text OR public.is_instructor());

CREATE POLICY reflections_insert ON public.reflections FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

-- anon (demo) never touches these tables — it uses localStorage in the client.
REVOKE INSERT, UPDATE, DELETE ON public.discussion_posts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.case_anchors     FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.reflections      FROM anon;
