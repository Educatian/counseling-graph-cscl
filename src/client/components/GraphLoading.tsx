import type { Lang } from "./TitleBar";

/**
 * Branded loading state — a soft pulsing constellation skeleton instead of a
 * bare "Loading…" string. Shown while the graph payload resolves.
 */
export function GraphLoading({ lang = "ko" }: { lang?: Lang }) {
  const dots = [
    { cx: 90, cy: 60, r: 9, c: "var(--counseling)", d: 0 },
    { cx: 150, cy: 110, r: 6, c: "var(--counseling)", d: 0.4 },
    { cx: 210, cy: 70, r: 13, c: "var(--shared)", d: 0.2 },
    { cx: 270, cy: 120, r: 6, c: "var(--clinical)", d: 0.6 },
    { cx: 330, cy: 64, r: 10, c: "var(--clinical)", d: 0.3 }
  ];
  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 18, pointerEvents: "none"
    }}>
      <svg width="420" height="180" viewBox="0 0 420 180" aria-hidden style={{ opacity: 0.9 }}>
        <line x1="90" y1="60" x2="210" y2="70" stroke="var(--border-sharp)" strokeWidth="1.2" />
        <line x1="150" y1="110" x2="210" y2="70" stroke="var(--border-sharp)" strokeWidth="1.2" />
        <line x1="210" y1="70" x2="270" y2="120" stroke="var(--shared)" strokeWidth="1.4" strokeDasharray="4,3" strokeOpacity="0.6" />
        <line x1="210" y1="70" x2="330" y2="64" stroke="var(--shared)" strokeWidth="1.4" strokeDasharray="4,3" strokeOpacity="0.6" />
        {dots.map((n, i) => (
          <circle key={i} cx={n.cx} cy={n.cy} r={n.r} fill={n.c}
            className="load-dot" style={{ animationDelay: `${n.d}s` }} />
        ))}
      </svg>
      <div style={{
        fontSize: 13, color: "var(--text-tertiary)", fontWeight: 500,
        letterSpacing: "-0.005em"
      }}>
        {lang === "ko" ? "지식 그래프를 불러오는 중…" : "Loading the knowledge graph…"}
      </div>
    </div>
  );
}
