/**
 * Phase 0 bootstrap: creates tables directly from the Drizzle schema using
 * raw DDL, and loads core-graph.seed.json into core_nodes/core_edges if empty.
 * Keeps Phase 0 friction-free; switch to drizzle-kit migrations in Phase A.
 */
import { libsql, db, schema } from "./client.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";

const DDL = `
CREATE TABLE IF NOT EXISTS core_nodes (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  level TEXT NOT NULL,
  label_ko TEXT NOT NULL,
  label_en TEXT,
  description TEXT,
  parent_hub_id TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS core_nodes_domain_idx ON core_nodes(domain);
CREATE INDEX IF NOT EXISTS core_nodes_level_idx ON core_nodes(level);
CREATE INDEX IF NOT EXISTS core_nodes_parent_idx ON core_nodes(parent_hub_id);

CREATE TABLE IF NOT EXISTS core_edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  confidence REAL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS core_edges_src_idx ON core_edges(source_id);
CREATE INDEX IF NOT EXISTS core_edges_tgt_idx ON core_edges(target_id);
CREATE INDEX IF NOT EXISTS core_edges_rel_idx ON core_edges(relation);

CREATE TABLE IF NOT EXISTS core_snapshots (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  author_id TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  session_id TEXT,
  cohort_id TEXT,
  kind TEXT NOT NULL,
  payload_json TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS event_log_user_idx ON event_log(user_id);
CREATE INDEX IF NOT EXISTS event_log_session_idx ON event_log(session_id);
CREATE INDEX IF NOT EXISTS event_log_kind_idx ON event_log(kind);
CREATE INDEX IF NOT EXISTS event_log_ts_idx ON event_log(ts);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  display_name TEXT NOT NULL,
  cohort_id TEXT
);

CREATE TABLE IF NOT EXISTS learning_paths (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  title_en TEXT,
  node_sequence_json TEXT NOT NULL,
  kind TEXT NOT NULL,
  is_shared INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- S5: Mirror-Mode cohort assignment + alignment cache
CREATE TABLE IF NOT EXISTS cohorts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mirror_mode TEXT NOT NULL DEFAULT 'hidden',
  reference_path_id TEXT
);

CREATE TABLE IF NOT EXISTS alignment_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  snapshot_id TEXT,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  computed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS alignment_user_idx ON alignment_scores(user_id);
CREATE INDEX IF NOT EXISTS alignment_metric_idx ON alignment_scores(metric);

-- S6: tri-layer discourse bipartite cache (populated by Python pipeline)
CREATE TABLE IF NOT EXISTS discourse_networks (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  scope_ref TEXT NOT NULL,
  bipartite_json TEXT NOT NULL,
  tokenizer TEXT NOT NULL DEFAULT 'konlpy_okt',
  computed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS discourse_scope_idx ON discourse_networks(scope, scope_ref);
`;

export async function initDb() {
  // libsql's executeMultiple handles multi-statement DDL
  await libsql.executeMultiple(DDL);
}

export async function loadSeedIfEmpty() {
  const rows = await db.select({ n: sql<number>`count(*)` }).from(schema.coreNodes).all();
  const existing = rows[0]?.n ?? 0;
  if (existing > 0) return { loaded: false, nodes: existing };

  const seedPath = resolve(process.cwd(), "src/client/data/core-graph.seed.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as {
    nodes: Array<{ id: string; domain: "counseling" | "clinical" | "shared"; level: "top_hub" | "mid_hub" | "concept"; labelKo: string; labelEn?: string; description?: string; parentHubId?: string }>;
    edges: Array<{ id: string; sourceId: string; targetId: string; relation: "contains" | "related_to" | "prerequisite_of" | "example_of" | "contrasts_with" | "bridges_to"; confidence?: number }>;
    paths: Array<{ id: string; title: string; titleEn?: string; kind: "seeded_template"; nodeSequence: string[] }>;
  };

  for (const n of seed.nodes) {
    await db.insert(schema.coreNodes).values({
      id: n.id, domain: n.domain, level: n.level,
      labelKo: n.labelKo, labelEn: n.labelEn, description: n.description,
      parentHubId: n.parentHubId
    }).run();
  }
  for (const e of seed.edges) {
    await db.insert(schema.coreEdges).values({
      id: e.id, sourceId: e.sourceId, targetId: e.targetId,
      relation: e.relation, confidence: e.confidence
    }).run();
  }
  for (const p of seed.paths) {
    await db.insert(schema.learningPaths).values({
      id: p.id, authorId: "seed", title: p.title, titleEn: p.titleEn,
      nodeSequenceJson: JSON.stringify(p.nodeSequence),
      kind: p.kind, isShared: true, createdAt: new Date()
    }).run();
  }

  return { loaded: true, nodes: seed.nodes.length, edges: seed.edges.length, paths: seed.paths.length };
}
