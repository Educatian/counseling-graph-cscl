import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

// ---------- Core ontology (instructor-owned, versioned) ----------

export const coreNodes = sqliteTable("core_nodes", {
  id: text("id").primaryKey(),
  domain: text("domain", { enum: ["counseling", "clinical", "shared"] }).notNull(),
  level: text("level", { enum: ["top_hub", "mid_hub", "concept"] }).notNull(),
  labelKo: text("label_ko").notNull(),
  labelEn: text("label_en"),
  description: text("description"),
  descriptionEn: text("description_en"),
  parentHubId: text("parent_hub_id"),
  version: integer("version").notNull().default(1)
}, (t) => ({
  byDomain: index("core_nodes_domain_idx").on(t.domain),
  byLevel: index("core_nodes_level_idx").on(t.level),
  byParent: index("core_nodes_parent_idx").on(t.parentHubId)
}));

export const coreEdges = sqliteTable("core_edges", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  targetId: text("target_id").notNull(),
  relation: text("relation", {
    enum: ["contains", "related_to", "prerequisite_of", "example_of", "contrasts_with", "bridges_to"]
  }).notNull(),
  confidence: real("confidence"),
  version: integer("version").notNull().default(1)
}, (t) => ({
  bySource: index("core_edges_src_idx").on(t.sourceId),
  byTarget: index("core_edges_tgt_idx").on(t.targetId),
  byRelation: index("core_edges_rel_idx").on(t.relation)
}));

export const coreSnapshots = sqliteTable("core_snapshots", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  authorId: text("author_id"),
  note: text("note")
});

// ---------- Research instrumentation ----------

export const eventLog = sqliteTable("event_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id"),
  sessionId: text("session_id"),
  cohortId: text("cohort_id"),
  kind: text("kind").notNull(),
  payload: text("payload_json"),
  ts: integer("ts", { mode: "timestamp_ms" }).notNull()
}, (t) => ({
  byUser: index("event_log_user_idx").on(t.userId),
  bySession: index("event_log_session_idx").on(t.sessionId),
  byKind: index("event_log_kind_idx").on(t.kind),
  byTs: index("event_log_ts_idx").on(t.ts)
}));

// ---------- Personal / collaborative layer (stubs for Phase B–C) ----------

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  role: text("role", { enum: ["student", "instructor", "expert", "researcher"] }).notNull(),
  displayName: text("display_name").notNull(),
  cohortId: text("cohort_id")
});

export const learningPaths = sqliteTable("learning_paths", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull(),
  title: text("title").notNull(),
  titleEn: text("title_en"),
  nodeSequenceJson: text("node_sequence_json").notNull(),
  kind: text("kind", {
    enum: ["student_free", "student_assigned", "expert_reference", "seeded_template"]
  }).notNull(),
  isShared: integer("is_shared", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

// ---------- S5: Mirror-Mode cohort assignment + alignment cache ----------

export const cohorts = sqliteTable("cohorts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mirrorMode: text("mirror_mode", { enum: ["visible", "hidden", "toggle"] }).notNull().default("hidden"),
  referencePathId: text("reference_path_id")
});

export const alignmentScores = sqliteTable("alignment_scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  snapshotId: text("snapshot_id"),
  metric: text("metric").notNull(),
  value: real("value").notNull(),
  computedAt: integer("computed_at", { mode: "timestamp_ms" }).notNull()
}, (t) => ({
  byUser: index("alignment_user_idx").on(t.userId),
  byMetric: index("alignment_metric_idx").on(t.metric)
}));

// ---------- S6: tri-layer discourse network (bipartite cache) ----------

export const discourseNetworks = sqliteTable("discourse_networks", {
  id: text("id").primaryKey(),
  scope: text("scope", { enum: ["node", "thread", "cohort"] }).notNull(),
  scopeRef: text("scope_ref").notNull(),
  bipartiteJson: text("bipartite_json").notNull(),
  tokenizer: text("tokenizer").notNull().default("konlpy_okt"),
  computedAt: integer("computed_at", { mode: "timestamp_ms" }).notNull()
}, (t) => ({
  byScope: index("discourse_scope_idx").on(t.scope, t.scopeRef)
}));
