import { useMemo } from "react";
import { alignmentScore } from "../lib/alignment";
import type { Lang } from "./TitleBar";

interface SeedPath { id: string; title: string; nodeSequence: string[]; }

interface Props {
  myPath: string[];
  seedPaths: SeedPath[];
  lang?: Lang;
}

const AG_STR = {
  ko: { heading: "정합도 · 내 경로 ↔ 가장 가까운 시드", overlap: "겹침", order: "순서" },
  en: { heading: "Alignment · MyPath ↔ closest seed", overlap: "overlap", order: "order" }
} as const;

/**
 * B9 — Mirror-Mode seed: live gauge 0..1 comparing the learner's recorded path
 * to the best-matching expert seed path. Shows which seed is closest + score
 * breakdown (set overlap / order-sensitive LCS). Zero UI when myPath is empty.
 */
export function AlignmentGauge({ myPath, seedPaths, lang = "ko" }: Props) {
  const t = AG_STR[lang];
  const result = useMemo(() => {
    if (myPath.length === 0 || seedPaths.length === 0) return null;
    let best: { seed: SeedPath; score: number; j: number; l: number } | null = null;
    for (const s of seedPaths) {
      const r = alignmentScore(myPath, s.nodeSequence);
      if (!best || r.score > best.score) best = { seed: s, score: r.score, j: r.jaccard, l: r.lcsSim };
    }
    return best;
  }, [myPath, seedPaths]);

  if (!result) return null;
  const pct = Math.round(result.score * 100);
  const color = result.score >= 0.6 ? "#10b981" : result.score >= 0.3 ? "#f59e0b" : "#94a3b8";

  return (
    <div style={{
      position: "absolute", bottom: 16, left: 16,
      padding: "10px 12px", minWidth: 200,
      borderRadius: 12,
      background: "rgba(255,255,255,0.85)",
      border: "1px solid rgba(15,23,42,0.08)",
      backdropFilter: "saturate(150%) blur(14px)",
      boxShadow: "0 6px 22px rgba(15,23,42,0.08)",
      fontSize: 11, color: "var(--text-secondary)", zIndex: 4
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 6
      }}>{t.heading}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ position: "relative", width: 56, height: 56 }}>
          <svg width={56} height={56} viewBox="0 0 56 56">
            <circle cx={28} cy={28} r={23} fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth={5} />
            <circle
              cx={28} cy={28} r={23} fill="none"
              stroke={color} strokeWidth={5}
              strokeDasharray={`${2 * Math.PI * 23 * result.score} ${2 * Math.PI * 23}`}
              strokeLinecap="round"
              transform="rotate(-90 28 28)"
              style={{ transition: "stroke-dasharray 400ms ease" }}
            />
          </svg>
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", color
          }}>{pct}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {result.seed.title}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2,
                        fontVariantNumeric: "tabular-nums" }}>
            {t.overlap} {result.j.toFixed(2)} · {t.order} {result.l.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}
