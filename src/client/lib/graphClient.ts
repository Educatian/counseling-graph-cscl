/**
 * Browser-direct graph fetch via Supabase PostgREST. Replaces the Hono
 * /api/graph endpoint — same shape on the wire (nodes, edges, paths), three
 * SELECTs in parallel.
 *
 * Falls back to fetching public/graph.json in static (GitHub Pages) mode,
 * matching the original behavior so the static demo keeps working without
 * Supabase.
 */
import { supabase } from "./supabase";
import type { GraphNode, GraphEdge } from "../components/GraphCanvas";

declare const __STATIC_MODE__: boolean;
const STATIC = typeof __STATIC_MODE__ !== "undefined" && __STATIC_MODE__;

export interface GraphResp {
  nodes: GraphNode[];
  edges: GraphEdge[];
  paths: Array<{ id: string; title: string; titleEn?: string; nodeSequence: string[] }>;
}

const undef = <T,>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

export async function fetchGraph(): Promise<GraphResp> {
  if (STATIC) {
    const r = await fetch(`${import.meta.env.BASE_URL}graph.json`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as GraphResp;
  }
  if (!supabase) {
    throw new Error("Supabase not configured. Check VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.");
  }

  const [nodesQ, edgesQ, pathsQ] = await Promise.all([
    supabase.from("core_nodes").select("id, domain, level, label_ko, label_en, description, description_en, parent_hub_id"),
    supabase.from("core_edges").select("id, source_id, target_id, relation, confidence"),
    supabase.from("learning_paths").select("id, title, title_en, node_sequence_json").eq("is_shared", true)
  ]);
  if (nodesQ.error) throw nodesQ.error;
  if (edgesQ.error) throw edgesQ.error;
  if (pathsQ.error) throw pathsQ.error;

  return {
    nodes: (nodesQ.data ?? []).map((n): GraphNode => ({
      id: n.id,
      domain: n.domain,
      level: n.level,
      labelKo: n.label_ko,
      labelEn: undef(n.label_en),
      description: undef(n.description),
      descriptionEn: undef(n.description_en),
      parentHubId: n.parent_hub_id
    })),
    edges: (edgesQ.data ?? []).map((e): GraphEdge => ({
      id: e.id,
      sourceId: e.source_id,
      targetId: e.target_id,
      relation: e.relation
    })),
    paths: (pathsQ.data ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      titleEn: undef(p.title_en),
      nodeSequence: (p.node_sequence_json as string[]) ?? []
    }))
  };
}
