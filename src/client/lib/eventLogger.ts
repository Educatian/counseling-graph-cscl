/**
 * Single chokepoint for client-side event emission. Every UI action that is
 * research-relevant MUST go through logEvent() so Phase D analytics can be
 * computed without instrumenting each call-site retroactively.
 *
 * Three transport modes:
 *   - Static (GH-Pages demo) — localStorage ring buffer, no server contact.
 *   - Auth mode (default)    — supabase-js insert into event_log directly.
 *                              The trigger event_log_stamp_identity_trg
 *                              (migration 0004) overwrites user_id and
 *                              cohort_id from the verified JWT, so a
 *                              malicious client can't spoof either field.
 *   - Unauthed (auth-mode)   — drop the event silently. RLS would reject
 *                              the insert anyway; better to no-op than to
 *                              spam the console.
 */
import { supabase } from "./supabase";

const sessionId = crypto.randomUUID();

export type EventKind =
  // Behavioral telemetry
  | "node_open" | "node_dwell_end" | "edge_click"
  | "path_step" | "path_save" | "path_share"
  | "zoom_change" | "zoom_tier_dwell" | "filter_change" | "tab_sequence"
  // Cognitive / epistemic markers
  | "thread_open" | "comment_post"
  | "case_attach" | "case_reanchor" | "quiz_answer"
  | "mypath_step" | "mypath_undo" | "recording_toggle" | "note_save"
  // Identity / cross-domain (C5)
  | "bridge_traverse" | "geodesic_jump"
  // Social / collaborative (Phase C)
  | "cursor_move" | "follow_start"
  // S5 — Mirror Mode metacognitive events
  | "mirror_glance" | "mirror_toggle" | "alignment_update" | "gauge_to_action_latency"
  // Session anchors
  | "app_ready" | "lang_change" | "landing_enter"
  // Onboarding — UX scaffold for low-agency learners (not yet a research var)
  | "tutorial_open" | "tutorial_step" | "tutorial_close"
  // Discovery prompts — epistemic onboarding (which inquiry question a learner picks)
  | "discovery_prompt_open" | "discovery_prompt_close" | "discovery_prompt_path_play"
  // IRB / governance
  | "consent_recorded";

declare const __STATIC_MODE__: boolean;
const STATIC = typeof __STATIC_MODE__ !== "undefined" && __STATIC_MODE__;

export async function logEvent(kind: EventKind, payload?: Record<string, unknown>) {
  if (STATIC) {
    try {
      const key = "eventLog";
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      arr.push({ ts: Date.now(), sessionId, kind, payload });
      if (arr.length > 500) arr.splice(0, arr.length - 500);
      localStorage.setItem(key, JSON.stringify(arr));
    } catch {}
    return;
  }
  if (!supabase) return; // misconfigured env; nothing to do
  // Drop pre-login events; RLS rejects them anyway. user_id and cohort_id
  // are filled by the BEFORE INSERT trigger from auth.uid() + JWT metadata.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  try {
    const { error } = await supabase.from("event_log").insert({
      session_id: sessionId,
      kind,
      payload_json: payload ?? null
    });
    if (error) console.warn("[eventLogger] insert failed", kind, error.message);
  } catch (e) {
    console.warn("[eventLogger] threw", kind, e);
  }
}

export function getSessionId() { return sessionId; }
