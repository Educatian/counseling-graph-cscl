-- Phase C — shared discourse tables (discussion / cases / reflections).
-- Apply via Supabase SQL editor or `npm run db:push` with a service connection.
-- RLS is added in 0006; realtime publication at the bottom of this file.

CREATE TABLE IF NOT EXISTS public.discussion_posts (
  id          text PRIMARY KEY,
  node_id     text NOT NULL,
  cohort_id   text NOT NULL,
  author_id   text NOT NULL,
  author_name text NOT NULL,
  body        text NOT NULL,
  tag         text CHECK (tag IN ('question','claim','evidence')),
  build_on_id text,
  ts          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discussion_node_idx   ON public.discussion_posts (node_id);
CREATE INDEX IF NOT EXISTS discussion_cohort_idx ON public.discussion_posts (cohort_id);

CREATE TABLE IF NOT EXISTS public.case_anchors (
  node_id       text NOT NULL,
  author_id     text NOT NULL,
  cohort_id     text NOT NULL,
  summary       text,
  precipitating text,
  perpetuating  text,
  protective    text,
  cultural      text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (node_id, author_id)
);
CREATE INDEX IF NOT EXISTS case_anchor_node_idx   ON public.case_anchors (node_id);
CREATE INDEX IF NOT EXISTS case_anchor_author_idx ON public.case_anchors (author_id);

CREATE TABLE IF NOT EXISTS public.reflections (
  id         text PRIMARY KEY,
  user_id    text NOT NULL,
  cohort_id  text,
  session_id text,
  answers    jsonb NOT NULL,
  ts         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reflections_user_idx ON public.reflections (user_id);

-- Realtime: stream new discussion posts to subscribed clients (live thread).
-- (case_anchors / reflections are not broadcast — fetched on demand.)
ALTER PUBLICATION supabase_realtime ADD TABLE public.discussion_posts;
