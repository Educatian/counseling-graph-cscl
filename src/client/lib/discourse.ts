/**
 * Discourse data layer — the collaborative knowledge-building substrate.
 *
 * Discussion posts, case anchors, and reflections previously lived only in the
 * browser's localStorage (private, single-user). This layer makes them a shared
 * cohort artifact when Supabase is configured, while preserving the exact
 * localStorage behavior in static/demo mode so the GH-Pages demo keeps working
 * offline.
 *
 * Theory: a community knowledge object that learners collectively improve
 * (Scardamalia & Bereiter 1994; Stahl 2006), scoped to a cohort (Zhang 2009).
 */
import { supabase } from "./supabase";

export type Move = "question" | "claim" | "evidence" | null;

export interface Identity {
  id: string;
  name: string;
  cohortId: string;
  /** true when posts are written to the shared backend (Supabase configured) */
  shared: boolean;
}

export interface Post {
  id: string;
  nodeId: string;
  authorId: string;
  authorName: string;
  body: string;
  tag: Move;
  buildOnId?: string | null;
  ts: number;
}

export interface Rubric {
  summary: string;
  precipitating: string;
  perpetuating: string;
  protective: string;
  cultural: string;
  updatedAt: number;
}

export const EMPTY_RUBRIC: Rubric = {
  summary: "", precipitating: "", perpetuating: "", protective: "", cultural: "", updatedAt: 0
};

const rid = () => Math.random().toString(36).slice(2, 11);

// ---------------------------------------------------------------------------
// Discussion thread
// ---------------------------------------------------------------------------

export async function loadThread(nodeId: string, id: Identity): Promise<Post[]> {
  if (supabase && id.shared) {
    const { data, error } = await supabase
      .from("discussion_posts")
      .select("id,node_id,cohort_id,author_id,author_name,body,tag,build_on_id,ts")
      .eq("node_id", nodeId)
      .order("ts", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToPost);
  }
  return readLocalThread(nodeId);
}

export async function addPost(
  nodeId: string, id: Identity, body: string, tag: Move, buildOnId: string | null = null
): Promise<Post> {
  const post: Post = {
    id: rid(), nodeId, authorId: id.id, authorName: id.name,
    body, tag, buildOnId, ts: Date.now()
  };
  if (supabase && id.shared) {
    const { error } = await supabase.from("discussion_posts").insert({
      id: post.id, node_id: nodeId, cohort_id: id.cohortId,
      author_id: id.id, author_name: id.name, body, tag, build_on_id: buildOnId
    });
    if (error) throw error;
    return post;
  }
  const next = [...readLocalThread(nodeId), post];
  writeLocalThread(nodeId, next);
  return post;
}

export async function removePost(post: Post, id: Identity): Promise<void> {
  if (supabase && id.shared) {
    const { error } = await supabase.from("discussion_posts").delete().eq("id", post.id);
    if (error) throw error;
    return;
  }
  writeLocalThread(post.nodeId, readLocalThread(post.nodeId).filter((p) => p.id !== post.id));
}

/**
 * Live updates. Supabase: Postgres-changes subscription on the node's posts.
 * Demo: cross-tab `storage` events. Returns an unsubscribe fn.
 */
export function subscribeThread(nodeId: string, id: Identity, onChange: () => void): () => void {
  if (supabase && id.shared) {
    const sb = supabase;
    const ch = sb
      .channel(`thread:${nodeId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "discussion_posts", filter: `node_id=eq.${nodeId}` },
        () => onChange())
      .subscribe();
    return () => { void sb.removeChannel(ch); };
  }
  const handler = (e: StorageEvent) => { if (e.key === localKey(nodeId)) onChange(); };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function rowToPost(r: Record<string, unknown>): Post {
  return {
    id: String(r.id), nodeId: String(r.node_id),
    authorId: String(r.author_id), authorName: String(r.author_name ?? "?"),
    body: String(r.body ?? ""), tag: (r.tag as Move) ?? null,
    buildOnId: (r.build_on_id as string) ?? null,
    ts: r.ts ? new Date(r.ts as string).getTime() : Date.now()
  };
}
const localKey = (nodeId: string) => `thread:${nodeId}`;
function readLocalThread(nodeId: string): Post[] {
  try {
    const raw = JSON.parse(localStorage.getItem(localKey(nodeId)) || "[]");
    // tolerate legacy posts {id,text,tag,ts}
    return raw.map((p: Record<string, unknown>): Post => ({
      id: String(p.id), nodeId,
      authorId: String(p.authorId ?? "me"), authorName: String(p.authorName ?? "나"),
      body: String(p.body ?? p.text ?? ""), tag: (p.tag as Move) ?? null,
      buildOnId: (p.buildOnId as string) ?? null, ts: Number(p.ts ?? 0)
    }));
  } catch { return []; }
}
function writeLocalThread(nodeId: string, posts: Post[]) {
  try { localStorage.setItem(localKey(nodeId), JSON.stringify(posts)); } catch {}
}

// ---------------------------------------------------------------------------
// Case anchor (C3)
// ---------------------------------------------------------------------------

export async function loadCase(nodeId: string, id: Identity): Promise<Rubric> {
  if (supabase && id.shared) {
    const { data, error } = await supabase
      .from("case_anchors")
      .select("summary,precipitating,perpetuating,protective,cultural,updated_at")
      .eq("node_id", nodeId).eq("author_id", id.id).maybeSingle();
    if (error) throw error;
    if (!data) return { ...EMPTY_RUBRIC };
    return {
      summary: data.summary ?? "", precipitating: data.precipitating ?? "",
      perpetuating: data.perpetuating ?? "", protective: data.protective ?? "",
      cultural: data.cultural ?? "",
      updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : 0
    };
  }
  try { return JSON.parse(localStorage.getItem(`case:${nodeId}`) || "null") || { ...EMPTY_RUBRIC }; }
  catch { return { ...EMPTY_RUBRIC }; }
}

export async function saveCase(nodeId: string, id: Identity, r: Rubric): Promise<Rubric> {
  const next = { ...r, updatedAt: Date.now() };
  if (supabase && id.shared) {
    const { error } = await supabase.from("case_anchors").upsert({
      node_id: nodeId, author_id: id.id, cohort_id: id.cohortId,
      summary: r.summary, precipitating: r.precipitating, perpetuating: r.perpetuating,
      protective: r.protective, cultural: r.cultural, updated_at: new Date().toISOString()
    }, { onConflict: "node_id,author_id" });
    if (error) throw error;
    return next;
  }
  try { localStorage.setItem(`case:${nodeId}`, JSON.stringify(next)); } catch {}
  return next;
}

export async function clearCase(nodeId: string, id: Identity): Promise<void> {
  if (supabase && id.shared) {
    await supabase.from("case_anchors").delete().eq("node_id", nodeId).eq("author_id", id.id);
    return;
  }
  try { localStorage.removeItem(`case:${nodeId}`); } catch {}
}

// ---------------------------------------------------------------------------
// Reflection (metacognitive session capture)
// ---------------------------------------------------------------------------

export interface Reflection {
  id: string;
  sessionId: string;
  answers: Record<string, string>;
  ts: number;
}

export async function saveReflection(id: Identity, sessionId: string, answers: Record<string, string>): Promise<void> {
  const row: Reflection = { id: rid(), sessionId, answers, ts: Date.now() };
  if (supabase && id.shared) {
    const { error } = await supabase.from("reflections").insert({
      id: row.id, user_id: id.id, cohort_id: id.cohortId, session_id: sessionId, answers
    });
    if (error) throw error;
    return;
  }
  try {
    const all = JSON.parse(localStorage.getItem("reflections") || "[]");
    all.push(row);
    localStorage.setItem("reflections", JSON.stringify(all));
  } catch {}
}
