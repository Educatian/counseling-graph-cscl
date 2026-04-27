import type { Lang } from "./TitleBar";
import type { DiscoveryPrompt } from "./DiscoveryPrompts";
import { logEvent } from "../lib/eventLogger";

interface Props {
  prompt: DiscoveryPrompt | null;
  onClose: () => void;
  onPlayPath?: (pathId: string) => void;
  lang: Lang;
}

const STR = {
  ko: {
    eyebrow: "탐구 질문",
    objectiveLabel: "이 질문이 노리는 것",
    nodesLabel: (n: number) => `이 질문을 위해 ${n}개 노드를 강조했습니다`,
    playPath: "▶ 전문가 경로 보기",
    close: "닫기",
    hint: "강조된 노드를 클릭해서 자세히 살펴보세요. 다른 노드를 보고 싶으면 좌측 사이드바에서 도메인을 바꾸거나 이 질문을 닫으면 됩니다."
  },
  en: {
    eyebrow: "Discovery question",
    objectiveLabel: "What this question targets",
    nodesLabel: (n: number) => `${n} nodes highlighted for this question`,
    playPath: "▶ Play expert path",
    close: "Close",
    hint: "Click any highlighted node to dig in. To explore elsewhere, switch domains in the sidebar or close this question."
  }
} as const;

/**
 * Floating panel anchored to the graph's top-left so it doesn't collide with
 * the NodeDetailPanel on the right or the AlignmentGauge on the bottom-left.
 * Visible whenever a discovery prompt is active in App state.
 */
export function DiscoveryPromptPanel({ prompt, onClose, onPlayPath, lang }: Props) {
  const t = STR[lang];
  if (!prompt) return null;

  return (
    <div
      data-tutorial="discovery-panel"
      style={{
        position: "absolute",
        top: 16, left: 16,
        width: 360,
        maxHeight: "calc(100vh - 200px)",
        overflow: "auto",
        padding: "16px 18px 14px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.94)",
        border: "1px solid rgba(15,23,42,0.1)",
        backdropFilter: "saturate(160%) blur(14px)",
        boxShadow: "0 16px 44px rgba(15,23,42,0.14), 0 4px 12px rgba(15,23,42,0.05)",
        color: "var(--text-primary)",
        fontSize: 13, lineHeight: 1.55,
        zIndex: 4
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
          textTransform: "uppercase", color: "var(--text-tertiary)"
        }}>🔍 {t.eyebrow}</div>
        <button
          className="close-btn"
          onClick={onClose}
          aria-label={t.close}
          title={t.close}
        >✕</button>
      </div>

      <div style={{
        marginTop: 6,
        fontFamily: "var(--font-display)",
        fontSize: 16.5, fontWeight: 600,
        letterSpacing: "-0.01em",
        color: "var(--text-primary)"
      }}>
        {prompt.question[lang]}
      </div>

      <div style={{
        marginTop: 12, padding: "10px 12px",
        background: "var(--glass-tint)",
        border: "1px solid var(--border-soft)",
        borderRadius: 10
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4
        }}>{t.objectiveLabel}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          {prompt.objective[lang]}
        </div>
      </div>

      <div style={{
        marginTop: 10, fontSize: 11.5, color: "var(--text-secondary)",
        display: "flex", alignItems: "center", gap: 6
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: 50,
          background: "rgba(91,141,239,0.85)",
          boxShadow: "0 0 0 3px rgba(91,141,239,0.15)"
        }} />
        <span>{t.nodesLabel(prompt.relatedNodeIds.length)}</span>
      </div>

      {prompt.optionalSeedPathId && onPlayPath ? (
        <button
          onClick={() => {
            void logEvent("discovery_prompt_path_play", { promptId: prompt.id, pathId: prompt.optionalSeedPathId });
            onPlayPath(prompt.optionalSeedPathId!);
          }}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "8px 12px",
            borderRadius: 8,
            background: "linear-gradient(135deg,#5b8def,#8b6fd9)",
            color: "#fff", border: "none", fontWeight: 600, fontSize: 12,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(91,141,239,0.3)"
          }}
        >{t.playPath}</button>
      ) : null}

      <div style={{
        marginTop: 10,
        fontSize: 10.5,
        color: "var(--text-tertiary)",
        lineHeight: 1.5,
        paddingTop: 10,
        borderTop: "1px dashed var(--border-soft)"
      }}>
        {t.hint}
      </div>
    </div>
  );
}
