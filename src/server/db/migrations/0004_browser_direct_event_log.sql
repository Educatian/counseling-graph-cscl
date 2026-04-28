-- 0004 — enable browser-direct event_log writes via Supabase PostgREST.
--
-- Architecture shift: drop the Hono /api/events server in favor of
-- `supabase.from('event_log').insert()` from the browser. Security moves to
-- two layers:
--
--   (1) RLS policy event_log_insert_self (already in place, migration 0001):
--         WITH CHECK (user_id = auth.uid()::text)
--       prevents one user from inserting a row attributed to another.
--
--   (2) Trigger BEFORE INSERT (this migration): server-derives user_id and
--       cohort_id from the verified JWT. Even if a malicious client tries to
--       forge cohort_id (RLS doesn't check it), the trigger overwrites with
--       the JWT's user_metadata.cohort_id before the row lands.
--
-- Result: same safety as the prior server-stamping middleware, no backend
-- to host. Client just calls supabase.from('event_log').insert({sessionId,
-- kind, payload}) — user_id and cohort_id are filled in for it.
--
-- Additive only — no DROP, no destructive ALTER.

CREATE OR REPLACE FUNCTION public.event_log_stamp_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Always derive from JWT; ignore any client-supplied values.
  NEW.user_id := COALESCE(auth.uid()::text, 'anon');
  NEW.cohort_id := auth.jwt() -> 'user_metadata' ->> 'cohort_id';
  -- Defensive: clamp future-dated client clocks to server time.
  IF NEW.ts IS NULL OR NEW.ts > now() + interval '1 hour' THEN
    NEW.ts := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_log_stamp_identity_trg ON public.event_log;
CREATE TRIGGER event_log_stamp_identity_trg
  BEFORE INSERT ON public.event_log
  FOR EACH ROW
  EXECUTE FUNCTION public.event_log_stamp_identity();

-- Explicit grants for browser-direct inserts. authenticated already has
-- INSERT by Supabase default, but pin it down so RLS is the only gate.
GRANT INSERT ON public.event_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.event_log_id_seq TO authenticated;
