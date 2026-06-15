/**
 * Realtime co-presence over Supabase Realtime presence channels.
 *
 * Gives the app the "C" in CSCL at the perceptual layer: learners see each
 * other's cursors and which node each peer is currently reading — the social
 * co-presence the event schema already anticipated (cursor_move / follow_start).
 *
 * No-op when Supabase is not configured (demo/static = single user), so the
 * GH-Pages demo is unaffected.
 */
import { supabase } from "./supabase";
import type { Identity } from "./discourse";

export interface Peer {
  id: string;
  name: string;
  color: string;
  nodeId: string | null;
  nodeLabel: string | null;
  /** normalized 0..1 viewport coords so cursors align across resolutions */
  x: number;
  y: number;
  t: number;
}

export interface PresenceHandle {
  update: (patch: Partial<Pick<Peer, "x" | "y" | "nodeId" | "nodeLabel">>) => void;
  leave: () => void;
}

const COLORS = ["#5b8def", "#e5695b", "#8b6fd9", "#10b981", "#f59e0b", "#ec4899", "#14b8a6"];
export function peerColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function joinPresence(id: Identity, onPeers: (peers: Peer[]) => void): PresenceHandle {
  if (!supabase || !id.shared) {
    return { update() {}, leave() {} };
  }
  const sb = supabase;
  const cur: Peer = {
    id: id.id, name: id.name, color: peerColor(id.id),
    nodeId: null, nodeLabel: null, x: 0, y: 0, t: Date.now()
  };
  const ch = sb.channel(`presence:${id.cohortId}`, { config: { presence: { key: id.id } } });

  const collect = () => {
    const state = ch.presenceState() as Record<string, Peer[]>;
    const peers: Peer[] = [];
    for (const key of Object.keys(state)) {
      if (key === id.id) continue;
      const meta = state[key]?.[0];
      if (meta) peers.push(meta);
    }
    onPeers(peers);
  };

  ch.on("presence", { event: "sync" }, collect)
    .on("presence", { event: "join" }, collect)
    .on("presence", { event: "leave" }, collect)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void ch.track(cur);
    });

  let last = 0;
  return {
    update(patch) {
      Object.assign(cur, patch, { t: Date.now() });
      const now = Date.now();
      if (now - last < 70) return; // throttle ~14fps
      last = now;
      void ch.track(cur);
    },
    leave() { void sb.removeChannel(ch); }
  };
}
