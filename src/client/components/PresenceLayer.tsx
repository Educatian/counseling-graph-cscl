import type { Peer } from "../lib/presence";
import type { Lang } from "./TitleBar";

/**
 * Renders peer cursors + an "online" pill. Pointer-events: none so it never
 * intercepts clicks. Empty (renders nothing) when there are no peers — i.e.
 * always, in single-user demo mode.
 */
export function PresenceLayer({ peers, lang }: { peers: Peer[]; lang: Lang }) {
  if (!peers.length) return null;
  const W = typeof window !== "undefined" ? window.innerWidth : 1280;
  const H = typeof window !== "undefined" ? window.innerHeight : 800;
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 50 }}>
      {/* online pill */}
      <div style={{
        position: "absolute", top: 56, right: 24,
        display: "flex", alignItems: "center", gap: 7,
        padding: "5px 11px", borderRadius: 999,
        background: "var(--glass-strong)", border: "1px solid var(--border-hair)",
        boxShadow: "var(--shadow-sm)", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)"
      }}>
        <span style={{ display: "inline-flex" }}>
          {peers.slice(0, 5).map((p) => (
            <span key={p.id} title={p.name} style={{
              width: 9, height: 9, borderRadius: "50%", background: p.color,
              border: "1.5px solid #fff", marginLeft: -3
            }} />
          ))}
        </span>
        {peers.length} {lang === "ko" ? "명 함께 보는 중" : "online"}
      </div>

      {/* peer cursors */}
      {peers.map((p) => {
        const left = Math.max(0, Math.min(1, p.x)) * W;
        const top = Math.max(0, Math.min(1, p.y)) * H;
        return (
          <div key={p.id} style={{
            position: "absolute", left, top,
            transform: "translate(-2px,-2px)", transition: "left 0.09s linear, top 0.09s linear"
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" style={{ filter: "drop-shadow(0 1px 2px rgba(15,23,42,0.3))" }}>
              <path d="M2 2 L2 14 L6 10 L9 16 L11 15 L8 9 L14 9 Z" fill={p.color} stroke="#fff" strokeWidth="1.2" />
            </svg>
            <div style={{
              marginTop: 1, marginLeft: 6, display: "inline-block",
              padding: "1px 7px", borderRadius: 6, fontSize: 10, fontWeight: 700,
              color: "#fff", background: p.color, whiteSpace: "nowrap",
              boxShadow: "0 1px 3px rgba(15,23,42,0.25)"
            }}>
              {p.name}{p.nodeLabel ? <span style={{ fontWeight: 400, opacity: 0.9 }}> · {p.nodeLabel}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
