import {
  pgTable,
  pgEnum,
  text,
  integer,
  serial,
  boolean,
  doublePrecision,
  timestamp,
  jsonb,
  index
} from "drizzle-orm/pg-core";

export const domainEnum = pgEnum("core_domain", ["counseling", "clinical", "shared"]);
export const levelEnum = pgEnum("core_level", ["top_hub", "mid_hub", "concept"]);
export const relationEnum = pgEnum("core_relation", [
  "contains",
  "related_to",
  "prerequisite_of",
  "example_of",
  "contrasts_with",
  "bridges_to"
]);
export const userRoleEnum = pgEnum("user_role", ["student", "instructor", "expert", "researcher"]);
export const pathKindEnum = pgEnum("learning_path_kind", [
  "student_free",
  "student_assigned",
  "expert_reference",
  "seeded_template"
]);
export const mirrorModeEnum = pgEnum("mirror_mode", ["visible", "hidden", "toggle"]);
export const discourseScopeEnum = pgEnum("discourse_scope", ["node", "thread", "cohort"]);

// ---------- Core ontology (instructor-owned, versioned) ----------

export const coreNodes = pgTable(
  "core_nodes",
  {
    id: text("id").primaryKey(),
    domain: domainEnum("domain").notNull(),
    level: levelEnum("level").notNull(),
    labelKo: text("label_ko").notNull(),
    labelEn: text("label_en"),
    description: text("description"),
    descriptionEn: text("description_en"),
    parentHubId: text("parent_hub_id"),
    version: integer("version").notNull().default(1)
  },
  (t) => ({
    byDomain: index("core_nodes_domain_idx").on(t.domain),
    byLevel: index("core_nodes_level_idx").on(t.level),
    byParent: index("core_nodes_parent_idx").on(t.parentHubId)
  })
);

export const coreEdges = pgTable(
  "core_edges",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    targetId: text("target_id").notNull(),
    relation: relationEnum("relation").notNull(),
    confidence: doublePrecision("confidence"),
    version: integer("version").notNull().default(1)
  },
  (t) => ({
    bySource: index("core_edges_src_idx").on(t.sourceId),
    byTarget: index("core_edges_tgt_idx").on(t.targetId),
    byRelation: index("core_edges_rel_idx").on(t.relation)
  })
);

export const coreSnapshots = pgTable("core_snapshots", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  authorId: text("author_id"),
  note: text("note")
});

// ---------- Research instrumentation ----------

export const eventLog = pgTable(
  "event_log",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id"),
    sessionId: text("session_id"),
    cohortId: text("cohort_id"),
    kind: text("kind").notNull(),
    payload: jsonb("payload_json"),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    byUser: index("event_log_user_idx").on(t.userId),
    bySession: index("event_log_session_idx").on(t.sessionId),
    byKind: index("event_log_kind_idx").on(t.kind),
    byTs: index("event_log_ts_idx").on(t.ts)
  })
);

// ---------- Personal / collaborative layer (stubs for Phase B–C) ----------

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  role: userRoleEnum("role").notNull(),
  displayName: text("display_name").notNull(),
  cohortId: text("cohort_id")
});

export const learningPaths = pgTable("learning_paths", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull(),
  title: text("title").notNull(),
  titleEn: text("title_en"),
  nodeSequenceJson: jsonb("node_sequence_json").notNull(),
  kind: pathKindEnum("kind").notNull(),
  isShared: boolean("is_shared").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

// ---------- S5: Mirror-Mode cohort assignment + alignment cache ----------

export const cohorts = pgTable("cohorts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mirrorMode: mirrorModeEnum("mirror_mode").notNull().default("hidden"),
  referencePathId: text("reference_path_id"),
  microAnalyticsLevel: text("micro_analytics_level", {
    enum: ["off", "basic", "full"]
  }).notNull().default("off")
});

export const alignmentScores = pgTable(
  "alignment_scores",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    snapshotId: text("snapshot_id"),
    metric: text("metric").notNull(),
    value: doublePrecision("value").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    byUser: index("alignment_user_idx").on(t.userId),
    byMetric: index("alignment_metric_idx").on(t.metric)
  })
);

// ---------- S6: tri-layer discourse network (bipartite cache) ----------

export const discourseNetworks = pgTable(
  "discourse_networks",
  {
    id: text("id").primaryKey(),
    scope: discourseScopeEnum("scope").notNull(),
    scopeRef: text("scope_ref").notNull(),
    bipartiteJson: jsonb("bipartite_json").notNull(),
    tokenizer: text("tokenizer").notNull().default("konlpy_okt"),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    byScope: index("discourse_scope_idx").on(t.scope, t.scopeRef)
  })
);

// ---------- IRB consents (G11) ----------
// Hard blocker for any human-subject paper from S1–S7. One row per
// (user × protocol_version × accepted-decision); insert-only — revisions
// are recorded as new rows, never updates, so the consent history is
// auditable.

export const consents = pgTable(
  "consents",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    cohortId: text("cohort_id"),
    protocolVersion: text("protocol_version").notNull(),
    accepted: boolean("accepted").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    ipHash: text("ip_hash"),
    uaHash: text("ua_hash"),
    notes: text("notes")
  },
  (t) => ({
    byUser: index("consents_user_idx").on(t.userId),
    byCohort: index("consents_cohort_idx").on(t.cohortId),
    byProtocol: index("consents_protocol_idx").on(t.protocolVersion)
  })
);
