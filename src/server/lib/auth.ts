/**
 * Server-side auth middleware for the Hono API.
 *
 * Reads the Supabase access token from `Authorization: Bearer <jwt>` and
 * verifies it via `supabase.auth.getUser(token)`. On success, sets `c.var.user`
 * with shape `{ id, email, role, cohortId }` derived from auth.users +
 * user_metadata. Adapter seam — swap implementation here, never elsewhere.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MiddlewareHandler } from "hono";

export interface AuthedUser {
  id: string;
  email: string | null;
  role: "student" | "instructor" | "expert" | "researcher" | "anon";
  cohortId: string | null;
}

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  _supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return _supabase;
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthedUser;
  }
}

const ANON: AuthedUser = { id: "anon", email: null, role: "anon", cohortId: null };

/**
 * Optional auth — tolerates missing/invalid tokens by setting `user=anon`.
 * Routes that need a real user should check `c.var.user.role !== 'anon'`.
 */
export const optionalAuth: MiddlewareHandler = async (c, next) => {
  const sb = getSupabase();
  const header = c.req.header("authorization") ?? c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!sb || !token) {
    c.set("user", ANON);
    return next();
  }

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) {
    c.set("user", ANON);
    return next();
  }

  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const role = (meta.role as AuthedUser["role"]) ?? "student";
  const cohortId = (meta.cohort_id as string | undefined) ?? null;

  c.set("user", {
    id: data.user.id,
    email: data.user.email ?? null,
    role,
    cohortId
  });
  return next();
};

/** Strict variant — rejects with 401 if no valid token. */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  await optionalAuth(c, async () => {});
  if (c.var.user.role === "anon") {
    return c.json({ error: "unauthenticated" }, 401);
  }
  return next();
};
