/**
 * Seed loader for Phase 0 → Supabase migration.
 *
 * Schema DDL is now managed by drizzle-kit migrations (see ./migrations/).
 * Run `npm run db:generate` after schema changes, then `npm run db:migrate`
 * to apply against Supabase. This file only handles loading core-graph.seed.json
 * into core_nodes / core_edges / learning_paths if those tables are empty.
 */
import { getDb, schema } from "./client.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";

export async function loadSeedIfEmpty() {
  const { db } = getDb();
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(schema.coreNodes);
  const existing = rows[0]?.n ?? 0;
  if (existing > 0) return { loaded: false, nodes: existing };

  const seedPath = resolve(process.cwd(), "src/client/data/core-graph.seed.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as {
    nodes: Array<{
      id: string;
      domain: "counseling" | "clinical" | "shared";
      level: "top_hub" | "mid_hub" | "concept";
      labelKo: string;
      labelEn?: string;
      description?: string;
      descriptionEn?: string;
      parentHubId?: string;
    }>;
    edges: Array<{
      id: string;
      sourceId: string;
      targetId: string;
      relation: "contains" | "related_to" | "prerequisite_of" | "example_of" | "contrasts_with" | "bridges_to";
      confidence?: number;
    }>;
    paths: Array<{ id: string; title: string; titleEn?: string; kind: "seeded_template"; nodeSequence: string[] }>;
  };

  if (seed.nodes.length) {
    await db.insert(schema.coreNodes).values(
      seed.nodes.map((n) => ({
        id: n.id,
        domain: n.domain,
        level: n.level,
        labelKo: n.labelKo,
        labelEn: n.labelEn,
        description: n.description,
        descriptionEn: n.descriptionEn,
        parentHubId: n.parentHubId
      }))
    );
  }
  if (seed.edges.length) {
    await db.insert(schema.coreEdges).values(
      seed.edges.map((e) => ({
        id: e.id,
        sourceId: e.sourceId,
        targetId: e.targetId,
        relation: e.relation,
        confidence: e.confidence
      }))
    );
  }
  if (seed.paths.length) {
    await db.insert(schema.learningPaths).values(
      seed.paths.map((p) => ({
        id: p.id,
        authorId: "seed",
        title: p.title,
        titleEn: p.titleEn,
        nodeSequenceJson: p.nodeSequence,
        kind: p.kind,
        isShared: true
      }))
    );
  }

  return { loaded: true, nodes: seed.nodes.length, edges: seed.edges.length, paths: seed.paths.length };
}
