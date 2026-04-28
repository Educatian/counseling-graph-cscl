import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare const __STATIC_MODE__: boolean;

const staticMode = typeof __STATIC_MODE__ !== "undefined" && __STATIC_MODE__;

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export const supabase: SupabaseClient | null =
  staticMode || !url || !anonKey
    ? null
    : createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      });

export const authConfigured = supabase !== null;
