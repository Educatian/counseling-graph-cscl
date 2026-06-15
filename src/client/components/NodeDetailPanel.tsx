import { useEffect, useState } from "react";
import type { GraphNode } from "./GraphCanvas";
import { logEvent } from "../lib/eventLogger";
import {
  type Identity, type Move, type Rubric, EMPTY_RUBRIC,
  loadThread, addPost, removePost, subscribeThread,
  loadCase, saveCase, clearCase, type Post
} from "../lib/discourse";

interface Props {
  node: GraphNode | null;
  onClose: () => void;
  lang?: "ko" | "en";
  identity: Identity;
}

const DOMAIN_COLOR: Record<string, string> = {
  counseling: "var(--counseling)",
  clinical: "var(--clinical)",
  shared: "var(--shared)"
};
const DOMAIN_LABEL: Record<"ko" | "en", Record<string, string>> = {
  ko: { counseling: "상담심리", clinical: "임상심리", shared: "공통 허브" },
  en: { counseling: "Counseling", clinical: "Clinical", shared: "Bridge hub" }
};

const TABS = ["Overview", "Discussion", "Cases", "Quiz", "Notes"] as const;
const TAB_LABEL: Record<"ko" | "en", Record<(typeof TABS)[number], string>> = {
  ko: { Overview: "개요", Discussion: "토론", Cases: "사례", Quiz: "퀴즈", Notes: "노트" },
  en: { Overview: "Overview", Discussion: "Discussion", Cases: "Cases", Quiz: "Quiz", Notes: "Notes" }
};

const NDP_STR = {
  ko: {
    overviewEmpty: "이 노드의 설명은 아직 비어있습니다. (세부 개념 노드의 description은 Phase A-2에서 충전 예정)",
    quizPlaceholder: "Phase C에서 퀴즈 항목을 노드에 연결합니다.",
    rubricIntro: (<>이 노드에 사례를 붙이면 <b>C3 연구</b> — 사례 배치 위치가 사례개념화 품질을 예측 — 의 원자료가 됩니다.</>),
    rubricLabels: { summary: "요약", precipitating: "촉발", perpetuating: "유지", protective: "보호", cultural: "문화·맥락" },
    rubricFields: { summary: "한 줄 요약", precipitating: "촉발 요인", perpetuating: "유지 요인", protective: "보호 요인", cultural: "문화·맥락" },
    attach: "사례 첨부",
    clear: "초기화",
    saved: "저장됨",
    notesIntro: (<>이 노드에 대한 사적 메모. 로컬에만 저장되며 나중에 <b>C4</b> — 개인↔전문가 그래프 정합도 — 분석에 활용됩니다.</>),
    notesPlaceholder: "이 개념을 나의 언어로 다시 쓰기 / 궁금한 점 / 사례 연결 아이디어…",
    save: "저장",
    discussionIntro: (<><b>인식론적 행위(Q/C/E)</b> 태그를 붙여 토론하면 <b>S6</b> 담론 네트워크 분석의 코딩 데이터가 됩니다.</>),
    emptyThread: "아직 코멘트 없음. 첫 질문/주장/근거를 남겨보세요.",
    postPlaceholder: "질문·주장·근거를 남기세요 (⌘/Ctrl+Enter로 게시)",
    post: "게시",
    contrastCo: "상담",
    contrastCl: "임상"
  },
  en: {
    overviewEmpty: "This node has no description yet. (Detailed concept descriptions will be filled in Phase A-2.)",
    quizPlaceholder: "Quiz items will be linked to nodes in Phase C.",
    rubricIntro: (<>Anchoring a case here feeds the raw data for <b>Study C3</b> — where a case is attached predicts conceptualization quality.</>),
    rubricLabels: { summary: "Summary", precipitating: "Precipitating", perpetuating: "Perpetuating", protective: "Protective", cultural: "Cultural" },
    rubricFields: { summary: "one-line summary", precipitating: "precipitating factors", perpetuating: "perpetuating factors", protective: "protective factors", cultural: "cultural / contextual" },
    attach: "Attach case",
    clear: "Clear",
    saved: "saved",
    notesIntro: (<>Private notes for this node. Stored locally; later used in <b>Study C4</b> — personal ↔ expert graph alignment.</>),
    notesPlaceholder: "Re-state the concept in your own words / questions / case-linking ideas…",
    save: "Save",
    discussionIntro: (<>Tag posts with <b>epistemic moves (Q/C/E)</b> — they become coded data for <b>Study S6</b> discourse network analysis.</>),
    emptyThread: "No comments yet. Leave the first question / claim / evidence.",
    postPlaceholder: "Leave a question, claim, or evidence (⌘/Ctrl+Enter to post)",
    post: "Post",
    contrastCo: "Counseling",
    contrastCl: "Clinical"
  }
} as const;

const MOVE_HINTS: Record<"ko" | "en", Record<"question" | "claim" | "evidence", string>> = {
  ko: { question: "질문", claim: "주장", evidence: "근거" },
  en: { question: "Question", claim: "Claim", evidence: "Evidence" }
};

export function NodeDetailPanel({ node, onClose, lang = "ko", identity }: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const t = NDP_STR[lang];
  if (!node) return null;

  const shownDesc = lang === "en" && node.descriptionEn ? node.descriptionEn : node.description;
  const isSharedHub = node.domain === "shared" && !!shownDesc;

  return (
    <aside className="detail-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 50, flex: "none",
              background: DOMAIN_COLOR[node.domain], boxShadow: "0 0 0 2px rgba(255,255,255,0.7)"
            }} />
            <span className="caption">{DOMAIN_LABEL[lang][node.domain] ?? node.domain} · {node.level}</span>
          </div>
          <h2>{lang === "en" && node.labelEn ? node.labelEn : node.labelKo}</h2>
          {lang === "ko" && node.labelEn
            ? <div className="subtitle">{node.labelEn}</div>
            : null}
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="tab-row" data-tutorial="ndp-tabs">
        {TABS.map((tabKey) => (
          <button
            key={tabKey}
            className={tab === tabKey ? "active" : ""}
            onClick={() => setTab(tabKey)}
            data-tutorial={
              tabKey === "Discussion" ? "ndp-discussion"
              : tabKey === "Cases" ? "ndp-cases"
              : undefined
            }
          >{TAB_LABEL[lang][tabKey]}</button>
        ))}
      </div>

      {tab === "Overview" && (
        <>
          {isSharedHub ? (
            <SharedContrast desc={shownDesc!} lang={lang} />
          ) : shownDesc ? (
            <div className="body" style={{ marginTop: 12 }}>
              {shownDesc}
            </div>
          ) : (
            <div className="body" style={{ marginTop: 12, color: "var(--text-tertiary)" }}>
              {t.overviewEmpty}
            </div>
          )}
        </>
      )}
      {tab === "Discussion" && <DiscussionThread nodeId={node.id} lang={lang} identity={identity} />}
      {tab === "Cases" && <CaseRubric nodeId={node.id} lang={lang} identity={identity} />}
      {tab === "Quiz" && (
        <div className="body" style={{ marginTop: 12 }}>
          {t.quizPlaceholder}
        </div>
      )}
      {tab === "Notes" && <PersonalNotes nodeId={node.id} lang={lang} />}

      <div style={{
        marginTop: 16, paddingTop: 10, borderTop: "1px solid var(--border-soft)",
        fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)"
      }}>
        id: {lang === "en" ? node.id.split("__")[0] : node.id}
      </div>
    </aside>
  );
}

/** §3-1 대조 설명을 "상담 ↔ 임상" 2열 카드로 분리 표시 */
function SharedContrast({ desc, lang }: { desc: string; lang: "ko" | "en" }) {
  const match = desc.match(/상담:\s*(.+?)\s*↔\s*임상:\s*(.+)/)
             ?? desc.match(/Counseling:\s*(.+?)\s*↔\s*Clinical:\s*(.+)/i);
  if (!match) return <div className="body" style={{ marginTop: 12 }}>{desc}</div>;
  const [, coText, clText] = match;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
      <ContrastCard color="var(--counseling)" label={NDP_STR[lang].contrastCo} text={coText} />
      <ContrastCard color="var(--clinical)"   label={NDP_STR[lang].contrastCl} text={clText} />
    </div>
  );
}

/** B5 — §C3 사례개념화 rubric. Shared backend (Supabase) or localStorage (demo). */
function CaseRubric({ nodeId, lang, identity }: { nodeId: string; lang: "ko" | "en"; identity: Identity }) {
  const t = NDP_STR[lang];
  const [r, setR] = useState<Rubric>(EMPTY_RUBRIC);
  useEffect(() => {
    let live = true;
    loadCase(nodeId, identity).then((c) => { if (live) setR(c); }).catch(() => { if (live) setR(EMPTY_RUBRIC); });
    return () => { live = false; };
  }, [nodeId, identity]);

  const save = () => {
    saveCase(nodeId, identity, r).then((next) => {
      setR(next);
      void logEvent("case_attach", { nodeId, fieldsFilled: Object.entries(next).filter(([k, v]) => k !== "updatedAt" && v).length });
    }).catch(() => {});
  };
  const clear = () => {
    clearCase(nodeId, identity).then(() => setR(EMPTY_RUBRIC)).catch(() => {});
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
        {t.rubricIntro}
      </div>
      {field(t.rubricLabels.summary, t.rubricFields.summary, "summary", 2)}
      {field(t.rubricLabels.precipitating, t.rubricFields.precipitating, "precipitating", 2)}
      {field(t.rubricLabels.perpetuating, t.rubricFields.perpetuating, "perpetuating", 2)}
      {field(t.rubricLabels.protective, t.rubricFields.protective, "protective", 2)}
      {field(t.rubricLabels.cultural, t.rubricFields.cultural, "cultural", 2)}
      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
        <button className="segment active" onClick={save} style={{ flex: 1, fontWeight: 600 }}>{t.attach}</button>
        {r.updatedAt ? (
          <button className="segment" onClick={clear} style={{ fontSize: 11 }}>{t.clear}</button>
        ) : null}
      </div>
      {r.updatedAt ? (
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
          {t.saved} {new Date(r.updatedAt).toLocaleString()}
        </div>
      ) : null}
    </div>
  );
}

/** Personal notes — B10. Quick markdown-free textarea, localStorage per node. */
function PersonalNotes({ nodeId, lang }: { nodeId: string; lang: "ko" | "en" }) {
  const t = NDP_STR[lang];
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
        {t.notesIntro}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={t.notesPlaceholder}
        style={{
          resize: "vertical", minHeight: 96, padding: "8px 10px",
          fontSize: 12.5, lineHeight: 1.55, fontFamily: "inherit",
          border: "1px solid var(--border-soft)", borderRadius: 6,
          background: "rgba(255,255,255,0.7)", color: "var(--text-primary)"
        }}
      />
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button className="segment active" onClick={save} style={{ fontWeight: 600 }}>{t.save}</button>
        {savedAt ? (
          <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            {t.saved} {new Date(savedAt).toLocaleString()}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Discussion thread — shared CSCL scaffold with epistemic-move tags. */
const MOVE_META: Record<Exclude<Move, null>, { label: string; color: string }> = {
  question: { label: "Q", color: "#6366f1" },
  claim:    { label: "C", color: "#10b981" },
  evidence: { label: "E", color: "#f59e0b" }
};

function DiscussionThread({ nodeId, lang, identity }: { nodeId: string; lang: "ko" | "en"; identity: Identity }) {
  const t = NDP_STR[lang];
  const hints = MOVE_HINTS[lang];
  const [posts, setPosts] = useState<Post[]>([]);
  const [draft, setDraft] = useState("");
  const [tag, setTag] = useState<Move>(null);

  const refresh = () => { loadThread(nodeId, identity).then(setPosts).catch(() => {}); };
  useEffect(() => {
    setDraft(""); setTag(null);
    let live = true;
    loadThread(nodeId, identity).then((p) => { if (live) setPosts(p); }).catch(() => { if (live) setPosts([]); });
    // Live updates: cohort posts stream in (Supabase) / cross-tab (demo).
    const unsub = subscribeThread(nodeId, identity, () => { if (live) refresh(); });
    return () => { live = false; unsub(); };
  }, [nodeId, identity]);

  const post = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft(""); setTag(null);
    addPost(nodeId, identity, text, tag).then((p) => {
      setPosts((cur) => (cur.some((x) => x.id === p.id) ? cur : [...cur, p]));
      void logEvent("comment_post", { nodeId, tag, length: text.length, shared: identity.shared });
    }).catch(() => {});
  };
  const remove = (p: Post) => {
    setPosts((cur) => cur.filter((x) => x.id !== p.id));
    removePost(p, identity).catch(() => {});
  };

  return (
    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
        {t.discussionIntro}
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
                  }}>{m.label} · {hints[p.tag as Exclude<Move, null>]}</span>
                ) : (
                  <span style={{ color: "var(--text-tertiary)" }}>·</span>
                )}
                {identity.shared ? (
                  <span style={{ fontWeight: 700, color: p.authorId === identity.id ? "var(--accent)" : "var(--text-secondary)" }}>
                    {p.authorName}{p.authorId === identity.id ? " ·" : ""}
                  </span>
                ) : null}
                <span>{new Date(p.ts).toLocaleString()}</span>
                {p.authorId === identity.id ? (
                  <button
                    onClick={() => remove(p)}
                    style={{ marginLeft: "auto", border: "none", background: "transparent",
                             color: "var(--text-tertiary)", cursor: "pointer", fontSize: 11 }}
                    aria-label="delete"
                  >✕</button>
                ) : <span style={{ marginLeft: "auto" }} />}
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--text-primary)",
                            whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {p.body}
              </div>
            </div>
          );
        })}
        {posts.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "6px 2px" }}>
            {t.emptyThread}
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
                title={hints[k]}
                style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                  padding: "4px 8px",
                  background: active ? m.color : undefined,
                  color: active ? "#fff" : "var(--text-secondary)",
                  borderColor: active ? m.color : undefined
                }}
              >{m.label} {hints[k]}</button>
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
          placeholder={t.postPlaceholder}
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
        >{t.post}</button>
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
