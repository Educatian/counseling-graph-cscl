/**
 * Single chokepoint for client-side event emission. Every UI action that is
 * research-relevant MUST go through logEvent() so Phase D analytics can be
 * computed without instrumenting each call-site retroactively.
 */
const sessionId = crypto.randomUUID();

export type EventKind =
  | "node_open" | "node_dwell_end" | "edge_click"
  | "path_step" | "path_save"
  | "thread_open" | "comment_post" | "case_attach" | "quiz_answer"
  | "cursor_move" | "follow_start"
  | "zoom_change" | "filter_change"
  | "app_ready" | "lang_change" | "landing_enter"
  | "mypath_step" | "recording_toggle" | "note_save"
  // S5 — Mirror Mode metacognitive events
  | "mirror_glance" | "mirror_toggle" | "alignment_update"
  // Onboarding — UX scaffold for low-agency learners (not yet a research var)
  | "tutorial_open" | "tutorial_step" | "tutorial_close"
  // Discovery prompts — epistemic onboarding (which inquiry question a learner picks)
  | "discovery_prompt_open" | "discovery_prompt_close" | "discovery_prompt_path_play";

declare const __STATIC_MODE__: boolean;
const STATIC = typeof __STATIC_MODE__ !== "undefined" && __STATIC_MODE__;

export async function logEvent(kind: EventKind, payload?: Record<string, unknown>, userId = "anon") {
  if (STATIC) {
    // GitHub Pages demo: no server to POST to. Keep a rolling local ring buffer
    // so a curious user/inspector can still see events via devtools.
    try {
      const key = "eventLog";
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      arr.push({ ts: Date.now(), userId, sessionId, kind, payload });
      if (arr.length > 500) arr.splice(0, arr.length - 500);
      localStorage.setItem(key, JSON.stringify(arr));
    } catch {}
    return;
  }
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, sessionId, kind, payload })
    });
  } catch (e) {
    console.warn("[eventLogger] failed", kind, e);
  }
}

export function getSessionId() { return sessionId; }
