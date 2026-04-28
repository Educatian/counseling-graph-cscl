/**
 * Single chokepoint for client-side event emission. Every UI action that is
 * research-relevant MUST go through logEvent() so Phase D analytics can be
 * computed without instrumenting each call-site retroactively.
 *
 * In auth mode the server derives user_id and cohort_id from the bearer token,
 * so the client only needs to send sessionId + kind + payload.
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
    // GitHub Pages demo: no server to POST to. Keep a rolling local ring buffer
    // so a curious user/inspector can still see events via devtools.
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
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.authorization = `Bearer ${token}`;
    }
    await fetch("/api/events", {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId, kind, payload })
    });
  } catch (e) {
    console.warn("[eventLogger] failed", kind, e);
  }
}

export function getSessionId() { return sessionId; }
