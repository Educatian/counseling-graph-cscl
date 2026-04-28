import type { Lang } from "./TitleBar";

export interface DiscoveryPrompt {
  id: string;
  domain: "counseling" | "clinical" | "shared";
  question: { ko: string; en: string };
  objective: { ko: string; en: string };
  relatedNodeIds: string[];
  optionalSeedPathId: string | null;
}

const DOMAIN_DOT: Record<string, string> = {
  counseling: "var(--counseling)",
  clinical: "var(--clinical)",
  shared: "var(--shared)"
};

const STR = {
  ko: {
    section: "오늘의 탐구 질문",
    nodes: (n: number) => `노드 ${n}개 강조`
  },
  en: {
    section: "Today's discovery questions",
    nodes: (n: number) => `${n} nodes highlighted`
  }
} as const;

interface Props {
  prompts: DiscoveryPrompt[];
  activeId: string | null;
  onSelect: (p: DiscoveryPrompt | null) => void;
  /** When true, idle (non-active) cards pulse gently to draw the eye. */
  pulse?: boolean;
  lang: Lang;
}

/**
 * Sidebar section that surfaces curated discovery questions. Clicking a card
 * activates a graph-wide highlight of its related nodes; clicking again (or
 * selecting another card) clears/swaps. The full panel with question body
 * and optional expert-path replay is rendered by DiscoveryPromptPanel.
 */
export function DiscoveryPrompts({ prompts, activeId, onSelect, pulse, lang }: Props) {
  const t = STR[lang];
  return (
    <>
      <div className="sidebar-section-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span>🔍 {t.section}</span>
        <span style={{
          fontSize: 8, fontWeight: 600, letterSpacing: "0.06em",
          padding: "1px 6px", borderRadius: 999,
          background: "rgba(139,111,217,0.12)", color: "var(--shared)",
          textTransform: "uppercase"
        }}>P0</span>
      </div>
      <div style={{ padding: "0 8px 4px", display: "grid", gap: 6 }} data-tutorial="discovery-section">
        {prompts.map((p) => {
          const active = activeId === p.id;
          return (
            <button
              key={p.id}
              data-tutorial={`discovery-card-${p.id}`}
              className={`discovery-card${pulse && !active ? " discovery-card-pulse" : ""}`}
              onClick={() => onSelect(active ? null : p)}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 10,
                border: active ? "1px solid var(--accent)" : "1px solid var(--border-soft)",
                background: active ? "rgba(91,141,239,0.08)" : "rgba(255,255,255,0.6)",
                boxShadow: active ? "0 2px 10px rgba(91,141,239,0.18)" : "var(--shadow-xs)",
                cursor: "pointer",
                display: "grid", gap: 4,
                font: "inherit"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 50,
                  background: DOMAIN_DOT[p.domain], flex: "none",
                  boxShadow: "0 0 0 2px rgba(255,255,255,0.7)"
                }} />
                <span style={{
                  fontSize: 12.5, fontWeight: active ? 600 : 500,
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  lineHeight: 1.4
                }}>
                  {p.question[lang]}
                </span>
              </div>
              <div style={{
                fontSize: 10, color: "var(--text-tertiary)",
                fontFamily: "var(--font-mono)", marginLeft: 14
              }}>
                {t.nodes(p.relatedNodeIds.length)}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
