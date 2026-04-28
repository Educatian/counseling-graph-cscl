# Micro-analytics — fine-grained tracking proposals (Tier 2)

Companion to `docs/ANALYTICS_RESEARCH_MAP.md`. The master map's G1–G12 are
mid-grain *behavioral* signals. This document proposes **G13–G35** —
**micro-analytics** that operate at the interaction / attention / composition
level. Each unlocks specific deeper analyses and most also support the same
S1–S7 paper roadmap, but the surface area is finer-grained: keystroke timing,
mouse-hover dwell, idle gaps, draft revisions, gauge state transitions, and
session-pacing features.

> **Why a separate tier.** These signals are high-volume (G13 mouse hover at
> 500ms cadence = ~120 events/min/user), so they need sampling, opt-in, and
> careful IRB framing. They're also genuinely high-value — micro-timing
> around the Mirror Mode gauge (S5) and keystroke-pause patterns during Q/C/E
> composition (S6) carry signal that the mid-grain stream simply can't see.

---

## 0. Tier-2 design principles

| principle | why |
|---|---|
| **Sampling > raw** | Mouse + scroll telemetry is high-volume; emit summaries every N seconds, not raw streams |
| **Privacy-safe defaults** | Never log keystroke *contents* — only timing, length deltas, backspace counts |
| **Cohort-flag-gated** | Most micro-signals are off by default and turn on per cohort by `cohorts.micro_analytics_level` ∈ `{off, basic, full}` |
| **Aggregable server-side** | Send enriched events; never join with PII at the client |
| **Auditable in IRB protocol** | Every Tier-2 signal is named in the consent form; learners see the menu |

---

## 1. Tier-2 gap proposals (G13–G35)

### Attention & navigation

#### G13 — `mouse_hover_dwell`
- **Where:** `GraphCanvas.tsx` node hover handlers.
- **Trigger:** mouse stays on a node ≥800ms without click; emit on hover-leave with `dwellMs`. Throttle: ≤1 emit per node per 5 seconds.
- **Payload:** `{nodeId, dwellMs, didClickAfter:boolean, mouseDistance}`
- **Why it matters:** Hover-without-click = pre-decision attention; ratio of `hover ÷ click` flags hesitancy / surveying behavior. **Predicts S2 expert vs novice profiles** without needing webcam eye-tracking.
- **LOC:** ~30
- **Volume:** ~20–40 events/session

#### G14 — `keystroke_telemetry` (privacy-safe)
- **Where:** all text inputs (`NodeDetailPanel.tsx` Q/C/E + notes; future `comment.body` field).
- **Trigger:** on input blur or post-submit; emit a *summary* of the typing session — never raw keystrokes.
- **Payload:** `{nodeId, fieldKind:"Q"|"C"|"E"|"note", durationMs, totalKeystrokes, backspaceCount, longestPauseMs, idleGapsCount, finalLength}`
- **Why it matters:** Pause patterns are validated proxies for cognitive effort (pauses → planning, fluent runs → recall). **Unlocks S6 micro-discourse paper** without ever logging text content.
- **LOC:** ~50 (small reducer wrapping each TextArea)
- **IRB note:** explicitly disclose "we record typing rhythm not content" — distinguishes from invasive keylogging

#### G15 — `draft_abandon`
- **Where:** every text input.
- **Trigger:** input had ≥10 keystrokes, then user navigated away / cleared / closed panel without submit.
- **Payload:** `{nodeId, fieldKind, finalLength, durationMs, exitReason:"navigate"|"clear"|"panel_close"|"tab_blur"}`
- **Why it matters:** Abandoned drafts = stuck reasoning; volume + reason distribution is publishable as "what makes counseling trainees abandon a Q/C/E?"
- **LOC:** ~25

#### G16 — `backtrack_event`
- **Where:** synthetic event from `node_open` sequence.
- **Trigger:** opened node A, then within 5s opened node B where B was opened earlier in the same session.
- **Payload:** `{fromNodeId, backToNodeId, intermediateCount, gapMs}`
- **Why it matters:** Backtracking is a debugging-style cognition signal. Combined with `mypath_step`, distinguishes deliberate path-recording from exploratory wandering. Server-side derivation (no client emitter needed).
- **LOC:** ~50 (SQL view in migration 0003)

#### G17 — `idle_gap`
- **Where:** `App.tsx` global activity listener.
- **Trigger:** continuous no-input ≥5 seconds; emit on activity resume with the gap length.
- **Payload:** `{idleMs, lastActivityKind, exitVia:"click"|"scroll"|"keyboard"|"focus"}`
- **Why it matters:** Idle gaps decompose session time into *active* vs *think-or-distracted*. Required for any duration-normalized metric.
- **LOC:** ~30

#### G18 — `tab_focus_change`
- **Where:** `App.tsx` `visibilitychange` listener.
- **Trigger:** browser tab focus/blur.
- **Payload:** `{visible:boolean, sessionDurationSoFarMs}`
- **Why it matters:** Distinguishes "studying" sessions from "tab-open-in-background" sessions. Without this, all duration metrics inflate.
- **LOC:** ~10

#### G19 — `node_revisit`
- **Where:** synthetic, server-side derived from `node_open` events.
- **Trigger:** none — derived view.
- **Payload:** `(node_id, user_id, visit_count, first_visit_ts, last_visit_ts, sessions_visited)`
- **Why it matters:** Re-visits to the same node = consolidation. Bridge-hub re-visits specifically = cross-domain integration. Powers a strong S2 sub-claim.
- **LOC:** ~30 (SQL view)

#### G20 — `bridge_hub_dwell_aggregate`
- **Where:** server-side, derived from `event_log_node_dwell` + `core_nodes.domain`.
- **Trigger:** none — view.
- **Payload:** `(user_id, session_id, total_counseling_ms, total_clinical_ms, total_shared_ms, ratio_shared)`
- **Why it matters:** **Direct C5 dependent measure** — proportion of session time on bridge/shared hubs is a cross-domain integration signature.
- **LOC:** ~20 (SQL view)

### Composition & epistemic agency

#### G21 — `composition_self_tagging`
- **Where:** Q/C/E composer in `NodeDetailPanel.tsx`.
- **Trigger:** user starts typing with tag "Q" selected, switches to "C" or "E" before submit.
- **Payload:** `{nodeId, startTag, endTag, switchCount, finalLength}`
- **Why it matters:** Mid-compose tag-switches = explicit epistemic mode-switching; rare but high-signal for **S6 epistemic agency**.
- **LOC:** ~20

#### G22 — `panel_scroll_position`
- **Where:** `NodeDetailPanel.tsx` scroll container.
- **Trigger:** sample every 2s while panel is open AND scrolled past 25% of total height.
- **Payload:** `{nodeId, scrollPct, panelTab}`
- **Why it matters:** Reading-depth proxy without webcam. Distinguishes scan-and-bounce from deep-read. Sampled, not streamed.
- **LOC:** ~25

#### G23 — `path_replay_consumption`
- **Where:** `DiscoveryPromptPanel.tsx` (when expert seed path is animated).
- **Trigger:** user clicks "play seed path"; emit on each step + on stop/abandon.
- **Payload:** `{pathId, totalSteps, watchedSteps, abandonedAtStep:number|null, totalMs}`
- **Why it matters:** "Did the learner actually watch the expert do it?" — direct metacognitive scaffolding-uptake measure.
- **LOC:** ~15

#### G24 — `comment_position_in_thread`
- **Where:** when persisting `comment_post` (Phase C feature).
- **Trigger:** include thread position in payload at submit time.
- **Payload:** `{threadId, positionInThread, parentTag, replyDelayMs}` (replyDelay = since prior post)
- **Why it matters:** Late replies tend to be synthesizing; first replies tend to be claiming. **S6 thread-structure paper.**
- **LOC:** ~15 (mostly Phase-C feature work)

### Mirror Mode deep dive (S5)

#### G25 — `gauge_state_transitions`
- **Where:** `AlignmentGauge.tsx` — extends G2 (`alignment_update`) with state-color change detection.
- **Trigger:** when score crosses a threshold (0.30, 0.60) → gauge color changes gray↔amber↔green; emit with the user's *next action* attached.
- **Payload:** `{fromColor, toColor, score, scoreDeltaSinceLast, nextAction, nextActionLatencyMs}`
- **Why it matters:** **S5 paper headline-grade signal.** Did the gauge state change *cause* a behavioral change? Strongest causal-direction evidence we can get without a randomized condition.
- **LOC:** ~40

#### G26 — `gauge_glance_streak`
- **Where:** `AlignmentGauge.tsx`, builds on G1 (`mirror_glance`).
- **Trigger:** sequence of glances within 60s with no intervening action.
- **Payload:** `{glanceCount, totalDurationMs, scoreRangeAcrossGlances}`
- **Why it matters:** Repeated glancing without acting = stuck / fixation. Single glance + immediate action = healthy use of feedback.
- **LOC:** ~25

#### G27 — `gauge_action_correction`
- **Where:** `App.tsx` reducer that watches `mypath_step` after a `mirror_glance`.
- **Trigger:** glance → next mypath_step within 30s. Compute whether the new node *increased* alignment with closest seed.
- **Payload:** `{glanceScore, nextScore, scoreDelta, nodeId, isCorrection:boolean}` (correction = scoreDelta > 0)
- **Why it matters:** **The single cleanest S5 effect estimator.** Probability that a glance → corrective action vs noise.
- **LOC:** ~50

### Pacing & engagement

#### G28 — `session_pacing_features`
- **Where:** server-side aggregator, runs nightly.
- **Trigger:** for each completed session, compute and store summary.
- **Payload (one row per session):** `{user_id, session_id, total_active_ms, total_idle_ms, clicks_per_minute, posts_per_session, switches_per_minute, longest_focused_window_ms}`
- **Why it matters:** Engagement profile per session. Cohort-level distributions are a paper in themselves; per-user trajectories feed S7 phase models.
- **LOC:** ~80 (SQL function + nightly job)

#### G29 — `inter_session_gap`
- **Where:** server-side view.
- **Trigger:** none — derived.
- **Payload:** `(user_id, session_n, session_n_plus_1, gap_hours, weekday_of_each)`
- **Why it matters:** Daily-cadence vs cram-mode learners have different outcome trajectories. Required for longitudinal Paper 2 / S4.
- **LOC:** ~20

#### G30 — `time_of_day_pattern`
- **Where:** server-side aggregator over `event_log.ts`.
- **Trigger:** none — derived.
- **Payload:** `(user_id, hour_of_day, weekday, event_count)` aggregated.
- **Why it matters:** Time-of-day predicts achievement in some prior LAK work; novel for counseling-ed.
- **LOC:** ~15

### System & meta-instrumentation

#### G31 — `prompt_acceptance`
- **Where:** discovery prompt UI.
- **Trigger:** when a discovery prompt is shown, did the learner click vs dismiss vs ignore (timeout)?
- **Payload:** `{promptId, decision:"accepted"|"dismissed"|"ignored", deliberationMs}`
- **Why it matters:** Recommender-style signal — informs adaptive scaffolding designs.
- **LOC:** ~20

#### G32 — `tutorial_step_dwell`
- **Where:** `TutorialOverlay.tsx`, extends `tutorial_step`.
- **Trigger:** on step advance / close.
- **Payload:** `{stepId, dwellMs, didReturn:boolean}` (didReturn = previously reached this step)
- **Why it matters:** Identifies tutorial steps that confuse learners (long dwell + return).
- **LOC:** ~15

#### G33 — `error_or_loading`
- **Where:** any catch block in `App.tsx`, `eventLogger.ts`, network failures.
- **Trigger:** API error response, fetch timeout, render exception.
- **Payload:** `{kind:"api"|"render"|"timeout", endpoint?, message, stackHash}`
- **Why it matters:** Confounds: a session with intermittent errors looks "low engagement" but is actually broken UX. Necessary for clean cohort comparisons.
- **LOC:** ~20

### Knowledge-building markers (Scardamalia framework)

#### G34 — `synthesis_post`
- **Where:** comment_post composer.
- **Trigger:** when a comment references multiple node IDs (via @mention or link insertion — Phase C feature).
- **Payload:** `{nodeId, referencedNodeIds:[], tag, length}`
- **Why it matters:** Synthesizing posts (cite ≥2 nodes) are the operationalization of "rise above" in knowledge-building theory.
- **LOC:** ~30

#### G35 — `idea_improvement` (post-revision)
- **Where:** when a learner edits their own previous comment (Phase C feature: editable comments).
- **Trigger:** edit-and-save on existing comment.
- **Payload:** `{commentId, revisionN, finalTag, prevTag, lengthDelta, daysSinceOriginal}`
- **Why it matters:** **Direct measure of idea improvement** in the Scardamalia sense. Rare but high-signal for KBI papers.
- **LOC:** ~25

---

## 2. Suggested rollout phases

| phase | gaps to wire | rationale |
|---|---|---|
| **Phase A.1 — server-side derivations only** | G16, G19, G20, G29, G30 | Zero client work; pure SQL views/functions added to migration 0003. Runs against existing data immediately. |
| **Phase A.2 — quick client wins** | G13 (mouse hover), G17 (idle gap), G18 (tab focus), G33 (errors) | ~75 LOC total; covers 80% of attention/pacing decomposition. |
| **Phase B — Mirror Mode deep dive** | G25, G26, G27 (extends G1–G3) | Required for S5 paper headline; ~115 LOC. |
| **Phase B — Composition forensics** | G14, G15, G21, G31 | ~115 LOC. Unlocks S6 micro-discourse + epistemic agency papers. |
| **Phase C — KB framework** | G24, G34, G35 | Depends on Phase C `comments` table landing. |
| **Phase C — Pacing analytics** | G28, G32, G22, G23 | Nightly job + UI scrolling/replay listeners. |

---

## 3. Storage strategy by signal volume

| volume | examples | strategy |
|---|---|---|
| Low (<1/min/user) | G14 keystroke summary, G15 draft abandon, G21 self-tagging, G27 gauge correction | Direct insert to `event_log` |
| Medium (1–10/min/user) | G13 hover dwell, G17 idle gap, G18 tab focus, G31 prompt accept | Insert with no sampling; cohort flag enables/disables |
| High (>10/min/user) | G22 panel scroll position | Sample every 2s; cap at N samples per panel-open |
| Aggregate-only (offline) | G16 backtrack, G19 revisit, G20 bridge-hub dwell, G28 pacing, G29 inter-session, G30 time-of-day | Materialized SQL views or nightly jobs against `event_log` — no per-event row |

---

## 4. Cohort-level micro-analytics flag

Add to migration 0003:

```sql
ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS micro_analytics_level text NOT NULL DEFAULT 'off'
  CHECK (micro_analytics_level IN ('off','basic','full'));
```

| level | enabled signals |
|---|---|
| `off` | only mid-grain (G1–G12) |
| `basic` | + G13, G14, G15, G17, G18, G31, G33 |
| `full` | + G21, G22, G25, G26, G27, G28 |

Server-side derivations (G16, G19, G20, G29, G30, G34, G35) are always on
(they read `event_log` after the fact and don't add row volume).

The client checks `cohorts.micro_analytics_level` once at session start (via
`/api/me`) and tree-shakes the relevant emitters into a no-op for `off`.

---

## 5. IRB framing for Tier-2 signals

The consent form should disclose Tier-2 signals as a *menu* with explicit
opt-in per category:

> **Optional fine-grained measures.** With your permission, we may also
> record:
>
> - typing rhythm and pause patterns when you write Q/C/E posts or notes
>   (we never record what you type — only how long pauses are);
> - mouse hover and scroll patterns within the graph and panels;
> - browser-tab focus changes (so we can separate active study from
>   background tabs);
> - your interactions with the alignment gauge (when you look at it and
>   what you do next).
>
> [ ] I agree to the optional fine-grained measures above.
> [ ] I do not agree — only the basic measures will be recorded.

Per-category opt-in is implementable as bitfield columns on `consents.notes`
(JSON) without schema change.

---

## 6. What this proposal explicitly does NOT include

- **Webcam / eye-tracking / mic.** Out of scope; browser-only signals.
- **Raw keystroke contents.** G14 records timing, never characters.
- **IP / UA persistence.** Hashed only (consent table already does this).
- **Cross-site tracking.** No third-party analytics; everything stays in
  Supabase.
- **Fingerprinting.** No `navigator.userAgentData`, no canvas fingerprint.

These are deliberate exclusions for IRB defensibility — listed here so
reviewers don't have to ask.

---

## 7. Estimated total wiring debt

If all of G13–G35 ship:

| component | LOC |
|---|---|
| Client emitters (Phase A.2 + B + C) | ~360 |
| SQL views/functions (Phase A.1) | ~120 |
| Cohort-level flag plumbing | ~40 |
| Total | **~520** |

Plus a half-page extension to the IRB consent form (Section 5).

That's a 2–3 week sprint, distributed across phases as feasible. The
**Mirror Mode triple (G25/G26/G27)** alone — ~115 LOC — is what most directly
elevates Paper 1 from "publishable" to "paper-of-the-year material" at
ijCSCL.

---

*Companion to `docs/ANALYTICS_RESEARCH_MAP.md`. Last updated 2026-04-28.*
