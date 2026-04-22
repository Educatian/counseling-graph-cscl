import { useEffect, useState } from "react";
import type { GraphNode } from "./GraphCanvas";
import { logEvent } from "../lib/eventLogger";

interface Props {
  node: GraphNode | null;
  onClose: () => void;
  lang?: "ko" | "en";
}

const DOMAIN_COLOR: Record<string, string> = {
  counseling: "var(--counseling)",
  clinical: "var(--clinical)",
  shared: "var(--shared)"
};
const DOMAIN_LABEL: Record<string, string> = {
  counseling: "상담심리",
  clinical: "임상심리",
  shared: "공통 허브"
};

const TABS = ["Overview", "Discussion", "Cases", "Quiz", "Notes"] as const;

export function NodeDetailPanel({ node, onClose, lang = "ko" }: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  if (!node) return null;

  const isSharedHub = node.domain === "shared" && !!node.description;

  return (
    <aside className="detail-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 50, flex: "none",
              background: DOMAIN_COLOR[node.domain], boxShadow: "0 0 0 2px rgba(255,255,255,0.7)"
            }} />
            <span className="caption">{DOMAIN_LABEL[node.domain]} · {node.level}</span>
          </div>
          <h2>{lang === "en" && node.labelEn ? node.labelEn : node.labelKo}</h2>
          {lang === "en"
            ? <div className="subtitle">{node.labelKo}</div>
            : (node.labelEn ? <div className="subtitle">{node.labelEn}</div> : null)}
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="tab-row">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Overview" && (
        <>
          {isSharedHub ? (
            <SharedContrast desc={node.description!} />
          ) : node.description ? (
            <div className="body" style={{ marginTop: 12 }}>
              {node.description}
            </div>
          ) : (
            <div className="body" style={{ marginTop: 12, color: "var(--text-tertiary)" }}>
              이 노드의 설명은 아직 비어있습니다. (세부 개념 노드의 description은 Phase A-2에서 충전 예정)
            </div>
          )}
        </>
      )}
      {tab === "Discussion" && <DiscussionThread nodeId={node.id} />}
      {tab === "Cases" && <CaseRubric nodeId={node.id} />}
      {tab === "Quiz" && (
        <div className="body" style={{ marginTop: 12 }}>
          Phase C에서 퀴즈 항목을 노드에 연결합니다.
        </div>
      )}
      {tab === "Notes" && <PersonalNotes nodeId={node.id} />}

      <div style={{
        marginTop: 16, paddingTop: 10, borderTop: "1px solid var(--border-soft)",
        fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)"
      }}>
        id: {node.id}
      </div>
    </aside>
  );
}

/** §3-1 대조 설명을 "상담 ↔ 임상" 2열 카드로 분리 표시 */
function SharedContrast({ desc }: { desc: string }) {
  const match = desc.match(/상담:\s*(.+?)\s*↔\s*임상:\s*(.+)/);
  if (!match) return <div className="body" style={{ marginTop: 12 }}>{desc}</div>;
  const [, coText, clText] = match;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
      <ContrastCard color="var(--counseling)" label="상담" text={coText} />
      <ContrastCard color="var(--clinical)"   label="임상" text={clText} />
    </div>
  );
}

/** B5 — §C3 사례개념화 rubric. 노드별로 localStorage에 저장 → 나중에 export. */
interface Rubric {
  summary: string;
  precipitating: string;
  perpetuating: string;
  protective: string;
  cultural: string;
  updatedAt: number;
}
const EMPTY: Rubric = {
  summary: "", precipitating: "", perpetuating: "", protective: "", cultural: "", updatedAt: 0
};

function CaseRubric({ nodeId }: { nodeId: string }) {
  const key = `case:${nodeId}`;
  const [r, setR] = useState<Rubric>(() => {
    try { return JSON.parse(localStorage.getItem(key) || "null") || EMPTY; } catch { return EMPTY; }
  });
  useEffect(() => {
    try { setR(JSON.parse(localStorage.getItem(key) || "null") || EMPTY); } catch { setR(EMPTY); }
  }, [key]);

  const save = () => {
    const next = { ...r, updatedAt: Date.now() };
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
    setR(next);
    void logEvent("case_attach", { nodeId, fieldsFilled: Object.entries(next).filter(([k, v]) => k !== "updatedAt" && v).length });
  };
  const clear = () => {
    try { localStorage.removeItem(key); } catch {}
    setR(EMPTY);
  };

  const field = (
    label: string, hint: string, k: keyof Rubric, rows = 2
  ) => (
    <label style={{ display: "grid", gap: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                    textTransform: "uppercase", color: "var(--text-tertiary)" }}>
        {label}
        <span style={{ marginLeft: 6, fontWeight: 400, textTransform: "none", letterSpacing: 0,
                       color: "var(--text-tertiary)" }}>{hint}</span>
      </div>
      <textarea
        value={(r[k] as string) ?? ""}
        onChange={(e) => setR({ ...r, [k]: e.target.value })}
        rows={rows}
        style={{
          resize: "vertical", minHeight: 28, padding: "6px 8px",
          fontSize: 12, lineHeight: 1.5, fontFamily: "inherit",
          border: "1px solid var(--border-soft)", borderRadius: 6,
          background: "rgba(255,255,255,0.7)", color: "var(--text-primary)"
        }}
      />
    </label>
  );

  return (
    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
        이 노드에 사례를 붙이면 <b>C3 연구</b> — 사례 배치 위치가 사례개념화 품질을 예측 — 의 원자료가 됩니다.
      </div>
      {field("Summary", "한 줄 요약", "summary", 2)}
      {field("Precipitating", "촉발 요인", "precipitating", 2)}
      {field("Perpetuating", "유지 요인", "perpetuating", 2)}
      {field("Protective", "보호 요인", "protective", 2)}
      {field("Cultural", "문화·맥락", "cultural", 2)}
      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
        <button className="segment active" onClick={save} style={{ flex: 1, fontWeight: 600 }}>Attach case</button>
        {r.updatedAt ? (
          <button className="segment" onClick={clear} style={{ fontSize: 11 }}>Clear</button>
        ) : null}
      </div>
      {r.updatedAt ? (
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
          saved {new Date(r.updatedAt).toLocaleString()}
        </div>
      ) : null}
    </div>
  );
}

/** Personal notes — B10. Quick markdown-free textarea, localStorage per node. */
function PersonalNotes({ nodeId }: { nodeId: string }) {
  const key = `note:${nodeId}`;
  const [text, setText] = useState<string>(() => {
    try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
  });
  const [savedAt, setSavedAt] = useState<number>(() => {
    try { return Number(localStorage.getItem(key + ":ts") ?? 0); } catch { return 0; }
  });
  useEffect(() => {
    try {
      setText(localStorage.getItem(key) ?? "");
      setSavedAt(Number(localStorage.getItem(key + ":ts") ?? 0));
    } catch { setText(""); setSavedAt(0); }
  }, [key]);

  const save = () => {
    const now = Date.now();
    try {
      localStorage.setItem(key, text);
      localStorage.setItem(key + ":ts", String(now));
    } catch {}
    setSavedAt(now);
    void logEvent("note_save", { nodeId, length: text.length });
  };

  return (
    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
        이 노드에 대한 사적 메모. 로컬에만 저장되며 나중에 <b>C4</b> — 개인↔전문가 그래프 정합도 — 분석에 활용됩니다.
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="이 개념을 나의 언어로 다시 쓰기 / 궁금한 점 / 사례 연결 아이디어…"
        style={{
          resize: "vertical", minHeight: 96, padding: "8px 10px",
          fontSize: 12.5, lineHeight: 1.55, fontFamily: "inherit",
          border: "1px solid var(--border-soft)", borderRadius: 6,
          background: "rgba(255,255,255,0.7)", color: "var(--text-primary)"
        }}
      />
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button className="segment active" onClick={save} style={{ fontWeight: 600 }}>Save</button>
        {savedAt ? (
          <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            saved {new Date(savedAt).toLocaleString()}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Discussion thread — minimal CSCL scaffold with epistemic-move tags. */
type Move = "question" | "claim" | "evidence" | null;
interface Post { id: string; text: string; tag: Move; ts: number; }

const MOVE_META: Record<Exclude<Move, null>, { label: string; color: string; hint: string }> = {
  question: { label: "Q", color: "#6366f1", hint: "질문" },
  claim:    { label: "C", color: "#10b981", hint: "주장" },
  evidence: { label: "E", color: "#f59e0b", hint: "근거" }
};

function DiscussionThread({ nodeId }: { nodeId: string }) {
  const key = `thread:${nodeId}`;
  const [posts, setPosts] = useState<Post[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
  });
  const [draft, setDraft] = useState("");
  const [tag, setTag] = useState<Move>(null);

  useEffect(() => {
    try { setPosts(JSON.parse(localStorage.getItem(key) || "[]")); } catch { setPosts([]); }
    setDraft(""); setTag(null);
  }, [key]);

  const post = () => {
    const text = draft.trim();
    if (!text) return;
    const p: Post = { id: Math.random().toString(36).slice(2, 10), text, tag, ts: Date.now() };
    const next = [...posts, p];
    setPosts(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
    setDraft(""); setTag(null);
    void logEvent("comment_post", { nodeId, tag, length: text.length });
  };
  const remove = (id: string) => {
    const next = posts.filter((p) => p.id !== id);
    setPosts(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
  };

  return (
    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
        <b>Epistemic move</b> 태그를 붙여 토론하면 나중에 <b>S6</b> — 담론 네트워크 분석 — 의 코딩 데이터가 됩니다.
      </div>

      <div style={{
        display: "grid", gap: 4, maxHeight: 260, overflow: "auto",
        padding: posts.length ? 2 : 0
      }}>
        {posts.map((p) => {
          const m = p.tag ? MOVE_META[p.tag] : null;
          return (
            <div key={p.id} style={{
              padding: "8px 10px", borderRadius: 6,
              border: "1px solid var(--border-soft)",
              background: "rgba(255,255,255,0.55)",
              display: "grid", gap: 4
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10,
                            color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                {m ? (
                  <span style={{
                    padding: "1px 6px", borderRadius: 3, fontWeight: 700,
                    background: m.color, color: "#fff", letterSpacing: "0.04em"
                  }}>{m.label} · {m.hint}</span>
                ) : (
                  <span style={{ color: "var(--text-tertiary)" }}>·</span>
                )}
                <span>{new Date(p.ts).toLocaleString()}</span>
                <button
                  onClick={() => remove(p.id)}
                  style={{ marginLeft: "auto", border: "none", background: "transparent",
                           color: "var(--text-tertiary)", cursor: "pointer", fontSize: 11 }}
                  aria-label="delete"
                >✕</button>
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--text-primary)",
                            whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {p.text}
              </div>
            </div>
          );
        })}
        {posts.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "6px 2px" }}>
            아직 코멘트 없음. 첫 질문/주장/근거를 남겨보세요.
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {(Object.keys(MOVE_META) as Array<Exclude<Move, null>>).map((k) => {
            const m = MOVE_META[k];
            const active = tag === k;
            return (
              <button
                key={k}
                className="segment"
                onClick={() => setTag(active ? null : k)}
                title={m.hint}
                style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                  padding: "4px 8px",
                  background: active ? m.color : undefined,
                  color: active ? "#fff" : "var(--text-secondary)",
                  borderColor: active ? m.color : undefined
                }}
              >{m.label} {m.hint}</button>
            );
          })}
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); post(); }
          }}
          rows={3}
          placeholder="질문·주장·근거를 남기세요 (⌘/Ctrl+Enter로 게시)"
          style={{
            resize: "vertical", minHeight: 56, padding: "8px 10px",
            fontSize: 12.5, lineHeight: 1.55, fontFamily: "inherit",
            border: "1px solid var(--border-soft)", borderRadius: 6,
            background: "rgba(255,255,255,0.7)", color: "var(--text-primary)"
          }}
        />
        <button
          className="segment active"
          onClick={post}
          disabled={!draft.trim()}
          style={{ fontWeight: 600, opacity: draft.trim() ? 1 : 0.5 }}
        >Post</button>
      </div>
    </div>
  );
}

function ContrastCard({ color, label, text }: { color: string; label: string; text: string }) {
  return (
    <div style={{
      padding: "12px 14px",
      borderRadius: "var(--radius-md)",
      background: "var(--glass-tint)",
      border: "1px solid var(--border-soft)",
      borderLeft: `3px solid ${color}`,
      fontSize: 12.5,
      lineHeight: 1.55,
      color: "var(--text-secondary)"
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color, marginBottom: 6
      }}>{label}</div>
      {text}
    </div>
  );
}
