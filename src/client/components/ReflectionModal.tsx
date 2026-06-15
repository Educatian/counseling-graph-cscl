import { useState } from "react";
import type { Lang } from "./TitleBar";

/**
 * End-of-session metacognitive reflection — the "Reflect" beat of the guidebook's
 * Enter→Survey→Argue→Apply→Reflect cycle. Captures three short prompts; saved to
 * the reflections table (Supabase) or localStorage (demo) by the caller.
 */
const PROMPTS: Record<Lang, { title: string; lede: string; q: string[]; save: string; saved: string; later: string; close: string }> = {
  ko: {
    title: "오늘의 성찰",
    lede: "세션을 닫기 전에 잠깐 — 메타인지 한 모금.",
    q: [
      "오늘 새로 연결된 개념 하나는 무엇인가요?",
      "아직 헷갈리거나 더 알고 싶은 것은?",
      "다음 세션에서 먼저 살펴볼 것은?"
    ],
    save: "성찰 저장", saved: "저장되었습니다. 수고했어요!", later: "나중에", close: "닫기"
  },
  en: {
    title: "Today's reflection",
    lede: "Before you close — a quick sip of metacognition.",
    q: [
      "One concept you newly connected today?",
      "What's still unclear, or you want to explore?",
      "What will you look at first next session?"
    ],
    save: "Save reflection", saved: "Saved. Nice work!", later: "Later", close: "Close"
  }
};

export function ReflectionModal({
  open, lang, onClose, onSubmit
}: {
  open: boolean;
  lang: Lang;
  onClose: () => void;
  onSubmit: (answers: Record<string, string>) => void;
}) {
  const t = PROMPTS[lang];
  const [a, setA] = useState<string[]>(["", "", ""]);
  const [done, setDone] = useState(false);
  if (!open) return null;

  const submit = () => {
    onSubmit({ q1: a[0], q2: a[1], q3: a[2] });
    setDone(true);
    setTimeout(() => { setDone(false); setA(["", "", ""]); onClose(); }, 1100);
  };
  const anyFilled = a.some((x) => x.trim());

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      display: "grid", placeItems: "center",
      background: "rgba(15,23,42,0.45)", backdropFilter: "blur(3px)"
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460, maxWidth: "92vw", padding: "24px 26px",
          borderRadius: 18, background: "var(--glass-strong)",
          border: "1px solid var(--border-hair)", boxShadow: "var(--shadow-lg)"
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          ✶ {t.title}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", margin: "6px 0 16px" }}>{t.lede}</div>

        {done ? (
          <div style={{ padding: "24px 0", textAlign: "center", fontSize: 14, color: "var(--text-primary)", fontWeight: 600 }}>
            ✓ {t.saved}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {t.q.map((q, i) => (
              <label key={i} style={{ display: "grid", gap: 5 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{q}</span>
                <textarea
                  value={a[i]}
                  onChange={(e) => setA((cur) => cur.map((v, k) => (k === i ? e.target.value : v)))}
                  rows={2}
                  style={{
                    resize: "vertical", minHeight: 40, padding: "8px 10px",
                    fontSize: 12.5, lineHeight: 1.5, fontFamily: "inherit",
                    border: "1px solid var(--border-soft)", borderRadius: 8,
                    background: "rgba(255,255,255,0.75)", color: "var(--text-primary)"
                  }}
                />
              </label>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button className="segment" onClick={onClose} style={{ fontSize: 12 }}>{t.later}</button>
              <div style={{ flex: 1 }} />
              <button className="primary" onClick={submit} disabled={!anyFilled} style={{ opacity: anyFilled ? 1 : 0.5 }}>
                {t.save}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
