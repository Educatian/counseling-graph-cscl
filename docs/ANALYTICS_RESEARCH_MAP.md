# Analytics & Research Map — `counseling-graph-cscl`

**Audience.** Future co-authors, IRB reviewers, and grant writers. This doc
catalogs every analytics signal the app captures (or could cheaply capture)
and maps each to its strongest target venue. Every entry is grounded in
either actual code (`✓ wired`) or a concrete proposal (`⚠ proposed` — column
name, table, and firing condition specified). No speculation.

**TL;DR.** The app is a 9-table Postgres instrument with a single
`event_log` chokepoint. 17 of 28 declared event kinds are currently emitted;
11 declared kinds plus ~10 proposed kinds are needed to unlock the full
S1–S7 research roadmap. The under-emitted set is concentrated on three
high-value surfaces — **Mirror Mode (S5), dwell/zoom telemetry (S2/C2), and
discourse network bipartite (S6)** — each of which independently supports a
top-tier paper.

---

## 0. Ground truth — what the code actually instruments today

### Tables in `public` (Drizzle PG schema)

| table | rows | written by | research role |
|---|---|---|---|
| `core_nodes` | 214 | seed loader once | C1 ontology — read-only at runtime |
| `core_edges` | 204 | seed loader once | C1 (`bridges_to` confidence ← Delphi) |
| `core_snapshots` | 0 | ⚠ no writer | reproducibility / version freeze |
| `event_log` | live | every UI click via `logEvent()` | **primary analytics surface** |
| `users` | 11 | manual / cohort script | role + cohort_id source of truth |
| `learning_paths` | 8 | seed (templates) | expert reference paths (C2/S2) |
| `cohorts` | 0 | ⚠ no writer | S5 Mirror Mode visibility flag |
| `alignment_scores` | 0 | ⚠ no writer | S4 / S5 analytic cache |
| `discourse_networks` | 0 | ⚠ no writer | S6 KoNLPy bipartite cache |

### `EventKind` union — declared vs actually emitted

The single chokepoint at `src/client/lib/eventLogger.ts` declares 28 kinds.
Today, **17 are emitted somewhere** (✓), **11 are dead letter** (⚠ unwired).

| kind | wired? | emitter location | study tied to |
|---|---|---|---|
| `node_open` | ✓ | `GraphCanvas.tsx:227` | S2, C2 |
| `node_dwell_end` | ⚠ | — | **S2** (lag-sequential needs dwell exit) |
| `edge_click` | ✓ | `GraphCanvas.tsx:193` | S2 |
| `path_step` | ✓ | `App.tsx:170,261` | C2/S2 |
| `path_save` | ⚠ | — | **S4** (longitudinal graph-edit-distance) |
| `thread_open` | ⚠ | — | S6 corpus trigger |
| `comment_post` | ✓ | `NodeDetailPanel.tsx:335` (Q/C/E tag) | S6 |
| `case_attach` | ✓ | `NodeDetailPanel.tsx:190` | **S3** |
| `quiz_answer` | ⚠ | — (no quiz feature yet) | — |
| `cursor_move` | ⚠ | — | Phase C peer presence |
| `follow_start` | ⚠ | — | Phase C peer-follow |
| `zoom_change` | ⚠ | — | engagement / disorientation proxy |
| `filter_change` | ✓ | `App.tsx:306,308,325` | engagement |
| `app_ready` | ✓ | `App.tsx:232` | session anchor |
| `lang_change` | ✓ | `App.tsx:202` | C5 cross-domain identity proxy (KO ↔ EN) |
| `landing_enter` | ✓ | `App.tsx:208,216,221` | session boundary |
| `mypath_step` | ✓ | `App.tsx:268` | **S2 / S5 input** |
| `recording_toggle` | ✓ | `App.tsx:279` | metacognitive gate |
| `note_save` | ✓ | `NodeDetailPanel.tsx:270` (length only) | C4 (text content stays in localStorage) |
| `mirror_glance` | ⚠ | — | **S5 signature event** |
| `mirror_toggle` | ⚠ | — | S5 condition trigger |
| `alignment_update` | ⚠ | — | S5 dependent variable |
| `tutorial_open/step/close` | ✓ | `App.tsx:176,247`, `TutorialOverlay.tsx:125` | onboarding (not yet a research var) |
| `discovery_prompt_open/close/path_play` | ✓ | `App.tsx:151,152,190` + `DiscoveryPromptPanel.tsx:113` | epistemic onboarding |

**Server-side enrichment** (`src/server/lib/auth.ts` + `index.ts:34-46`):
every emitted event is stamped server-side with `user_id` (auth.uid),
`cohort_id` (`user_metadata.cohort_id`), and ISO timestamp. The client cannot
forge these — verified end-to-end on 2026-04-28 (`scripts/test-cohort-login.ts`,
11/11 users → 11 distinct uids → all `cohort_id='pilot_2026'`).

---

## 1. Master signal inventory (organized by analytic tier)

### 1a. Behavioral telemetry — clicks, dwells, navigation
| signal | kind | `event_log.payload_json` | wired? | tied to |
|---|---|---|---|---|
| Node open | `node_open` | `{nodeId, level, domain}` | ✓ | S2, C2 |
| Edge click (bridges vs containment) | `edge_click` | `{source, target, relation}` | ✓ | C1, C5 |
| Dwell time on node | `node_dwell_end` | `{nodeId, dwellMs}` | ⚠ | **S2** |
| Zoom interactions | `zoom_change` | `{k, tier, viaWheel\|button}` | ⚠ | engagement |
| Tab switching in NodeDetailPanel | `tab_sequence` | `{nodeId, tab, prevTab}` | ⚠ proposed | S2 epistemic |
| Filter changes (domain / bridges) | `filter_change` | `{domain\|bridgesOnly}` | ✓ | engagement |

### 1b. Cognitive / epistemic markers
| signal | kind | payload | wired? | tied to |
|---|---|---|---|---|
| Q / C / E discussion post | `comment_post` | `{nodeId, tag:"Q\|C\|E", length}` | ✓ | S6 |
| Case anchoring (precipitating / perpetuating / protective / cultural) | `case_attach` | `{nodeId, fieldsFilled}` | ✓ | **S3** |
| Path planning step (mypath REC) | `mypath_step` | `{nodeId, length}` | ✓ | S2/S5 input |
| Path save (publish a personal LearningPath) | `path_save` | `{pathId, length, kind}` | ⚠ | **S4** |
| Personal note save | `note_save` | `{nodeId, length}` | ✓ | C4 (length only — text in localStorage) |
| Bridge traversal (sequential `bridges_to` edge clicks) | `bridge_traverse` | `{from, to, hubChain}` | ⚠ proposed | **C5** |
| Geodesic jump (clicking a non-neighbor) | `geodesic_jump` | `{from, to, hops, viaSidebar}` | ⚠ proposed | S2 expertise marker |

### 1c. Metacognitive markers (S5 — the signature contribution)
| signal | kind | payload | wired? | tied to |
|---|---|---|---|---|
| Gauge glance | `mirror_glance` | `{score, durationMs}` | ⚠ | **S5** |
| Gauge visibility toggle | `mirror_toggle` | `{visible}` | ⚠ | S5 |
| Alignment value tick | `alignment_update` | `{score, jaccard, lcsSim, closestSeed}` | ⚠ | S5 |
| Gauge → action latency (glance, then next click) | `gauge_to_action_latency` | `{ms, gaugeScore, action}` | ⚠ proposed | **S5 paper headline** |
| Self-correction event (mypath rollback) | `mypath_undo` | `{undoneNodeId, length}` | ⚠ proposed | S5 metacognition |

### 1d. Social / collaborative (Phase C wiring still needed)
| signal | kind | payload | wired? | tied to |
|---|---|---|---|---|
| Open thread on a node | `thread_open` | `{nodeId, threadId, msgCount}` | ⚠ | S6 |
| Reply within thread | `comment_post` | already wired | ✓ | S6 |
| Cursor presence sample | `cursor_move` | `{x, y, peerHash}` | ⚠ | Phase C peer follow |
| Follow another learner | `follow_start` | `{targetUserId}` | ⚠ | Phase C peer follow |
| Path share | `path_share` | `{pathId, audience}` | ⚠ proposed | C2 social validation |

### 1e. Linguistic — Korean discourse (S6 novelty axis)
| signal | source | wired? | tied to |
|---|---|---|---|
| KoNLPy morpheme bipartite (concept × token) | `discourse_networks.bipartite_json` (`tokenizer:"konlpy_okt"`) | ⚠ no writer | **S6** — Korean CSCL discourse |
| Epistemic n-gram over comment text | `epistemic_ngram` | ⚠ proposed | S6 |
| Q/C/E density per thread | derived from `comment_post` payload | ✓ derivable | S6 |

### 1f. Identity / affect proxies (C5 cross-domain professional identity)
| signal | source | wired? | tied to |
|---|---|---|---|
| Counseling vs clinical dwell ratio | derived from `node_open` × `core_nodes.domain` | ✓ derivable | **C5** |
| Bridge node visit frequency | filter on `node_open.payload.domain='shared'` | ✓ derivable | C5 |
| Cross-domain bridge traversal | `bridge_traverse` | ⚠ proposed | C5 |
| Language toggle (KO ↔ EN) as identity signal | `lang_change` | ✓ | C5 (KO bias = first-language framing) |

### 1g. Temporal / sequential
| signal | derivation | wired? | tied to |
|---|---|---|---|
| Lag-sequential transition matrix | `event_log` ordered by ts | ✓ derivable | **S2** |
| n-gram path patterns over `mypath_step` | sequence mining offline | ✓ derivable | S2 |
| Phase transition (HMM / changepoint) | `event_log` by user_id | ✓ derivable | **S7** |
| Session boundaries | `landing_enter` ↔ `app_ready` ↔ idle gap | ✓ derivable | session-level analytics |

### 1h. Network-structural (compute-heavy, mostly offline)
| signal | derivation | wired? | tied to |
|---|---|---|---|
| Graph-edit-distance: learner path vs expert reference | `mypath_step` × `learning_paths(kind='expert_reference')` | ✓ derivable | **S4** |
| Personal-graph centrality (betweenness on visited subgraph) | offline pipeline | ✓ derivable | C4 |
| Delphi-confidence-weighted bridge traversal | `bridge_traverse` × `core_edges.confidence` | ⚠ both proposed + needs Delphi data | C1×C5 |

### 1i. Process-mining ready (event-log conformance)
| signal | derivation | wired? | tied to |
|---|---|---|---|
| Conformance to "Enter→Survey→Argue→Apply→Reflect" cycle | event-stream mapping over kinds | ✓ derivable | S2 process mining |
| Fitness / precision on expert reference traces | PM4Py / etc. on exported `event_log` | ✓ derivable | S2 |

---

## 2. LAK / EDM publishability map

For each signal cluster, the venue most likely to accept a paper *built
around that cluster as its primary contribution*. One-line argument grounded
in what the venue actually publishes.

| cluster | venue (1st choice) | paper type | why |
|---|---|---|---|
| Bridge ontology validation (C1) | **Counselor Education and Supervision** / *MECD* | full | counseling profession's only outlet for taxonomic validation; CES routinely runs Delphi studies |
| Path signatures of expertise (C2/S2) | **ijCSCL** / *Computers & Education* | full | both have published expert-vs-novice traversal papers (e.g., Oshima 2012) |
| Case-anchoring → conceptualization quality (C3/S3) | **Training and Education in Professional Psychology** | full | TEPP's exact remit — assessment of clinical reasoning via authored cases |
| Core ↔ personal alignment over time (C4/S4) | **Journal of the Learning Sciences** | full | JLS likes longitudinal graph-of-knowledge papers (Scardamalia lineage) |
| **Mirror Mode RCT (S5)** | **ijCSCL** | **full / signature paper** | learner-facing real-time alignment is a clear extension to KBDeX/ONA which the venue's editorial board built |
| Korean tri-layer discourse (S6) | **Computers & Education** / IEEE TLT | full | C&E publishes KoNLPy + bipartite work; IEEE TLT for the engineering angle |
| Phase-transition detection (S7) | **ijCSCL** / *Learning and Instruction* | full | Schoenfeld-style phase models are a perennial L&I topic |
| Session-level engagement / dwell heatmaps | **LAK Proceedings** / **JLA** | short / poster | LAK loves clean dashboards-as-method papers |
| Process-mining conformance to KB cycle | **EDM Proceedings** / **JEDM** | full | EDM's PM track is healthy; conformance fitness is publishable as standalone method |
| Discovery-prompt onboarding for low-agency learners | **BJET** / **AERA Open** | short | UX-meets-design-research scope — neither LAK nor EDM is the natural home |
| Counseling-domain graph affordances design study | **CHI EA** / **DIS** | short | if framed as HCI research-through-design |

---

## 3. Novelty scoring

🟢 **Novel** — under-published in this domain (counseling/clinical psych
educational tooling) AND uses a method that survives editorial scrutiny.
🟡 **Adjacent novel** — established method, new domain.
🔴 **Commodity** — well-trodden; insufficient on its own.

| cluster | rating | reasoning |
|---|---|---|
| Counseling↔clinical bridge ontology + Delphi validation | 🟢 | no published counseling-domain bridge ontology with Delphi confidence weights; CES has zero comparable artifact |
| Mirror Mode (real-time learner-facing alignment gauge) | 🟢 | KBDeX/ONA explicitly post-hoc only — addressing this gap is publishable in itself |
| Korean tri-layer (KoNLPy bipartite × ontology × path) for CSCL discourse | 🟢 | most CSCL discourse work is English-centric; Korean is genuinely under-served |
| Counseling-domain process mining (KB cycle conformance) | 🟢 | PM has been applied to MOOCs, K-12 STEM, programming — counseling is unexplored |
| Case-anchoring (where you attach the case) → conceptualization quality | 🟡 | structural variant of "diagram quality predicts essay quality" — extends to novel domain |
| Path signatures as expertise proxy (lag-sequential, n-gram) | 🟡 | well-established in learning sciences; novel only because counseling is the domain |
| Phase-transition / changepoint on `event_log` | 🟡 | well-trodden in MOOCs (Andres et al.); apply to counseling ed |
| Engagement / dwell heatmaps | 🔴 | every LAK proceedings has six of these |
| Filter / zoom telemetry | 🔴 | descriptive at best |
| Tutorial onboarding analytics | 🔴 | UX paper at most, not research-front |

The publication strategy implied: **lead with C1 (Delphi/CES) and S5 (Mirror
Mode/ijCSCL)** because both are 🟢 single-axis contributions; keep S6, S2,
S4 as follow-ons that compound from the same instrument.

---

## 4. Concrete gap proposals — signals to add

Each entry: **proposed event kind / table** · **payload schema** · **firing
condition** · **paper it unlocks**. Wiring effort estimate is rough (LOC).

### G1 — `mirror_glance` (S5 signature)
- **Where:** `AlignmentGauge.tsx`
- **Trigger:** `IntersectionObserver` on the gauge SVG; emit when gauge enters viewport AND user has the panel visually focused (mouse within ~200px).
- **Payload:** `{score, durationMs, closestSeed, sessionGlanceCount}`
- **LOC:** ~25
- **Unlocks:** S5 RCT — comparing glance frequency between gauge-visible vs gauge-hidden conditions is the main outcome.

### G2 — `alignment_update` (every gauge re-render with new value)
- **Where:** `AlignmentGauge.tsx`'s `useMemo`
- **Trigger:** when computed `result.score` changes by ≥0.02 from the previous tick.
- **Payload:** `{score, jaccard, lcsSim, closestSeedId, mypathLength}`
- **LOC:** ~10
- **Unlocks:** S5 dependent measure; populates `alignment_scores` table for the first time.

### G3 — `gauge_to_action_latency`
- **Where:** `App.tsx` — needs a small reducer that records the timestamp of the last `mirror_glance` and the timestamp of the next user action (`node_open`, `mypath_step`).
- **Trigger:** on the next action after a glance, if Δ<10s.
- **Payload:** `{ms, gaugeScoreAtGlance, actionKind}`
- **LOC:** ~30
- **Unlocks:** S5 paper headline metric — "did the gauge change behavior, and how fast?"

### G4 — `node_dwell_end`
- **Where:** `GraphCanvas.tsx:227` (where `node_open` fires) + on next selection / panel close.
- **Trigger:** when a node is unselected (next node opened, or panel closed). Compute Δt since `node_open`.
- **Payload:** `{nodeId, dwellMs, exitVia: "next_node" | "panel_close" | "filter_change"}`
- **LOC:** ~15
- **Unlocks:** S2 lag-sequential analytics; expert vs novice dwell distributions.

### G5 — `path_save`
- **Where:** new `Save MyPath` button in Sidebar.
- **Trigger:** when user persists the localStorage `myPath` array as a row in `learning_paths` (kind=`student_free` or `student_assigned`).
- **Payload:** `{pathId, length, kind, durationMs (since recording_toggle on)}`
- **LOC:** ~50 (new server endpoint + Sidebar button + DB write)
- **Unlocks:** S4 longitudinal alignment — without persisted student paths, the cross-time graph-edit-distance is not computable.

### G6 — `bridge_traverse`
- **Where:** synthetic event derived from a sequence of `node_open` events crossing a `bridges_to` edge.
- **Trigger:** when consecutive `node_open` events span domain="counseling" → "shared" → "clinical" (or reverse) within ≤30s.
- **Payload:** `{fromNode, hubNode, toNode, hubId, totalMs}`
- **LOC:** ~40 (server-side reducer; can be batch nightly via SQL window function)
- **Unlocks:** C5 cross-domain identity formation paper (counts of bridge traversals per learner over a semester).

### G7 — `zoom_tier_dwell`
- **Where:** `GraphCanvas.tsx` zoom handler (already has 3-tier logic at k=0.8, 1.6).
- **Trigger:** when crossing a zoom-tier boundary; emit dwell time at previous tier.
- **Payload:** `{prevTier: "top_hub" | "mid_hub" | "concept", dwellMs, k}`
- **LOC:** ~20
- **Unlocks:** S2 — surveying-vs-deep-diving as expertise signature; novices spend disproportionate time at top-hub tier.

### G8 — `tab_sequence` (in NodeDetailPanel)
- **Where:** `NodeDetailPanel.tsx`
- **Trigger:** when user switches between Description / Discussion / Cases / Notes tabs.
- **Payload:** `{nodeId, fromTab, toTab, dwellOnFromMs}`
- **LOC:** ~20
- **Unlocks:** epistemic-mode profile — does the learner read first (Description), then argue (Discussion), then apply (Cases)? Or skip Description?

### G9 — `case_reanchor`
- **Where:** `NodeDetailPanel.tsx` case attach flow.
- **Trigger:** when same `caseId` is detached from one node and re-attached to another.
- **Payload:** `{caseId, fromNodeId, toNodeId, fromDomain, toDomain}`
- **LOC:** ~15 (mostly storage-shape change to track `caseId` across nodes)
- **Unlocks:** S3 — re-anchoring is itself a case-conceptualization revision signal.

### G10 — `epistemic_ngram` (offline aggregator)
- **Where:** Python pipeline reading `event_log` rows where `kind='comment_post'` + payload.tag.
- **Trigger:** nightly job that materializes Q→C, C→E, etc. n-gram counts per cohort.
- **Output:** `discourse_networks` rows with scope=`cohort`.
- **LOC:** ~80 (Python script + SQL upsert)
- **Unlocks:** S6 paper — KoNLPy-augmented bipartite plus n-gram structure.

### G11 — `consent_event`
- **Where:** new IRB consent modal on first login (Phase B+).
- **Trigger:** user accepts/declines consent.
- **Payload:** `{accepted: boolean, version: "v1.0", timestamp}`
- **LOC:** ~60 (modal UI + DB column on `users`)
- **Unlocks:** any human-subject paper — required by IRB, blocks S1–S7 publication if missing.

### G12 — `quiz_answer` (only when quiz feature lands)
- Skip until Phase C — feature doesn't exist.

---

## 5. IRB watchlist

For each signal, the specific risk and the mitigation that goes in the
schema/migration.

| signal class | risk | mitigation |
|---|---|---|
| `comment_post.payload.length` | length is innocuous but the **content** lives in `localStorage` today; once persisted to a DB `comments` table (Phase C), free-text posts may contain identifiable case material | separate `comments.body_text` from `comments.metadata`; RLS already enforces self+instructor read; redact-pipeline before researcher exports |
| `note_save` (length-only today) | when notes get persisted server-side, same risk as comments | same as above; add `notes.is_pii_screened` flag set after review |
| `case_attach.payload` | currently only `{nodeId, fieldsFilled}` — *count*, not content. Safe. | keep counts; never log the rubric body itself |
| `mypath_step` | a fully reconstructed traversal sequence + cohort_id can re-identify a specific learner in a small cohort | publish only n-gram aggregates; raw sequences remain instructor-only |
| `lang_change` | innocuous in itself, but cross-cohort pattern + display_name could re-identify | `event_log.user_id` is auth.uid (UUID), not name; only instructors can join to display_name |
| `mirror_glance` | sensitive proxy for self-monitoring; could appear judgmental in IRB review | frame as *adaptive feedback* not surveillance; opt-in gauge per consent |
| `bridge_traverse` (proposed) | indicates a learner's professional-identity formation pattern — sensitive in licensed-clinician populations | aggregate at cohort level; never publish per-individual bridge histograms |
| Korean discourse content (KoNLPy bipartite) | original Korean text inside `discourse_networks.bipartite_json` may contain quotes from comments | tokenize-and-discard pipeline: store morphemes + frequencies only, drop original strings before the row is written |
| anonymous events (pre-login `landing_enter`) | currently `user_id='anon'`; mostly harmless but mixed with authed rows in dashboards | filter `user_id='anon'` from any cohort export; log a per-session `anon→authed` transition for IRB audit |
| `cohort_id` cross-table joins | a specific cohort + sequence pattern can identify a single individual in n=12 cohorts | researcher exports redact `cohort_id` for cohorts with n<10; require IRB approval for individual-level exports |

**Consent gate location.** Recommended: a one-time modal on first
authenticated session that writes a row to a new `consents` table (separate
from `event_log` to keep the RLS posture clean: consents are per-user,
write-once). Block all `event_log` inserts (or downgrade to `kind='anon'`)
until consent is recorded for the relevant cohort + protocol version.

---

## 6. Top 5 paper headlines (12-month horizon)

Ranked by **publishability × novelty**, given the data the instrument can
realistically capture once gaps G1–G11 are wired.

### 🥇 Paper 1 — "Mirror Mode: a real-time alignment-to-expert gauge as metacognitive scaffolding in a counseling-psychology knowledge graph"
- **Venue:** ijCSCL (signature paper)
- **Design:** within-subject RCT; gauge-visible vs gauge-hidden conditions per session; n≈60 graduate trainees over 6 sessions
- **DV:** trajectory of `alignment_score` over sessions × condition; secondary: `gauge_to_action_latency`
- **Novelty (🟢🟢🟢):** addresses the long-standing KBDeX/ONA "post-hoc only" limitation cited by the editorial board
- **Required gaps:** G1–G3 + G11

### 🥈 Paper 2 — "Validating a counseling↔clinical psychology bridge ontology via expert card-sort and Delphi: a CSCL research instrument"
- **Venue:** Counselor Education and Supervision (or MECD)
- **Design:** Delphi rounds with 8–12 licensed counselors / clinicians; bridge-edge confidence as the validated artifact; expert card-sort sanity check
- **DV:** bridge edge confidence distribution + inter-rater consensus over rounds
- **Novelty (🟢🟢🟢):** no published counseling-domain ontology with quantified cross-domain bridges
- **Required gaps:** card-sort and Delphi modes (Phase B feature work, not just analytics)

### 🥉 Paper 3 — "Korean CSCL discourse: a tri-layer (ontology × KoNLPy bipartite × path) network analysis"
- **Venue:** Computers & Education
- **Design:** secondary analysis on a deployed cohort's `event_log` + comment corpus; benchmark against an Oshima/KBDeX dataset of equivalent size
- **DV:** discriminative power of tri-layer over single-layer for predicting expert vs novice membership
- **Novelty (🟢🟢):** Korean discourse + tri-layer is a clean novelty axis
- **Required gaps:** G10 (bipartite writer) + Phase C `comments` table

### 🏅 Paper 4 — "Path signatures of counseling expertise: lag-sequential and process-mining analyses on a deployed knowledge graph"
- **Venue:** Computers & Education / EDM
- **Design:** expert (n≈10) vs graduate trainee (n≈60) traversal study on the same scenarios; lag-sequential + PM4Py conformance
- **DV:** transition matrix divergence; PM fitness/precision deltas
- **Novelty (🟡):** method is established; the counseling domain + the bridge hubs are the new substrate
- **Required gaps:** G4 (`node_dwell_end`) + G6/G7 (bridge traversal, zoom dwell) + G8 (tab sequence)

### 🏅 Paper 5 — "Where you anchor a case predicts conceptualization quality: structural evidence from a counseling knowledge graph"
- **Venue:** Training and Education in Professional Psychology
- **Design:** within-subject; raters blind-score case conceptualizations from each learner; correlate score with the *node* the learner originally anchored the case to (and whether they re-anchored it)
- **DV:** case conceptualization rubric score × graph-distance from optimal anchor
- **Novelty (🟡):** TEPP's exact remit; what's new is the graph-distance operationalization
- **Required gaps:** G9 (`case_reanchor`) + IRB-approved rubric scoring protocol

---

## 7. Wiring debt summary (what needs to ship before each paper)

| paper | gap dependencies | Phase | LOC budget |
|---|---|---|---|
| Paper 1 (Mirror Mode S5) | G1, G2, G3, G11 | A–B | ~125 |
| Paper 2 (Bridge ontology S1) | card-sort + Delphi modes (feature) | B | ~600 |
| Paper 3 (Tri-layer S6) | G10 + Phase C comments table | C | ~300 |
| Paper 4 (Path signatures S2) | G4, G6, G7, G8 | A–B | ~95 |
| Paper 5 (Case anchoring S3) | G9 + rubric protocol | A | ~30 |

Total Phase-A wiring debt to unlock 3 of 5 papers (1, 4, 5):
**~250 LOC + IRB consent modal**. That's a 1–2 week sprint, not a quarter.

---

## 8. What this document deliberately doesn't cover

- The CSCL pedagogical framing (Scardamalia / Oshima / Shaffer lineage) — see `README.md`.
- Setup / DevOps for the Supabase + Cloudflare migration — see `docs/SETUP_SUPABASE_CLOUDFLARE.md`.
- The exact statistical model per paper — to be drafted in pre-registration documents (OSF) per study.
- Card-sort / Delphi UI implementation specifics for Paper 2 — that's a Phase B feature spec, not analytics.

---

*Last updated: 2026-04-28. Authoritative ground truth: code at the SHA of the
last commit on `main` plus this session's local working tree.*
