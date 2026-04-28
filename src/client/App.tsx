import { useEffect, useMemo, useState } from "react";
declare const __STATIC_MODE__: boolean;
import "./styles.css";
import { GraphCanvas, type GraphNode, type GraphEdge, type Domain } from "./components/GraphCanvas";
import { NodeDetailPanel } from "./components/NodeDetailPanel";
import { Sidebar } from "./components/Sidebar";
import { TitleBar, type Lang } from "./components/TitleBar";
import { Landing } from "./components/Landing";
import { AlignmentGauge } from "./components/AlignmentGauge";
import { TutorialOverlay, type TutorialStep } from "./components/TutorialOverlay";
import { DiscoveryPromptPanel } from "./components/DiscoveryPromptPanel";
import type { DiscoveryPrompt } from "./components/DiscoveryPrompts";
import discoveryData from "./data/discovery-prompts.seed.json";
import { logEvent } from "./lib/eventLogger";
import { useAuth } from "./lib/useAuth";

const DISCOVERY_PROMPTS = (discoveryData.prompts as DiscoveryPrompt[]);

/**
 * Spotlight onboarding for low-agency learners (per Lim/Moon UX discussion).
 * Mirrors the guidebook's session cycle: Enter → Survey → Argue → Apply → Reflect.
 */
const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "discovery",
    targetSelector: '[data-tutorial="discovery-section"]',
    shape: "rect",
    pad: 6,
    title: {
      ko: "오늘의 탐구 질문에서 출발하기",
      en: "Start from today's discovery question"
    },
    body: {
      ko: "막막하다면 좌측 ‘오늘의 탐구 질문’ 카드를 하나 골라보세요. 관련 노드들이 강조돼서 어디서부터 살펴볼지 보입니다.",
      en: "Stuck? Pick a card under ‘Today's discovery questions’ on the left — its related nodes light up so you can see where to dig in."
    }
  },
  {
    id: "enter",
    targetSelector: '[data-tutorial="entry-hub"]',
    shape: "circle",
    pad: 14,
    multi: true,
    title: {
      ko: "또는 진입 허브에서 시작",
      en: "Or start from an entry hub"
    },
    body: {
      ko: "펄스로 빛나는 두 노드 — 상담 ‘문제영역’ · 임상 ‘정신병리’ — 도 자유 탐색의 시작점입니다. 하나를 클릭해 첫 노드를 열어보세요.",
      en: "The two pulsing nodes — counseling ‘problem areas’ · clinical ‘psychopathology’ — are entry points for free exploration. Click one to open your first node."
    }
  },
  {
    id: "bridges",
    targetSelector: '[data-tutorial="bridges-toggle"]',
    shape: "rect",
    pad: 6,
    title: {
      ko: "두 영역을 잇는 다리 보기",
      en: "See the bridges between domains"
    },
    body: {
      ko: "이 토글을 켜면 상담↔임상의 공통 허브와 브릿지 엣지만 강조됩니다. 두 정체성이 어디서 만나는지 한눈에 보세요.",
      en: "Toggle this to highlight only the shared hubs and bridge edges across counseling↔clinical."
    }
  },
  {
    id: "discussion",
    targetSelector: '[data-tutorial="ndp-discussion"]',
    shape: "rect",
    pad: 4,
    title: {
      ko: "Q · C · E로 토론하기",
      en: "Argue with Q · C · E"
    },
    body: {
      ko: "노드를 열면 우측 패널의 [토론] 탭에서 질문(Q) · 주장(C) · 근거(E) 태그를 붙여 의견을 남길 수 있습니다.",
      en: "Open a node, then in the side panel’s Discussion tab post with Q (Question) · C (Claim) · E (Evidence) tags."
    }
  },
  {
    id: "cases",
    targetSelector: '[data-tutorial="ndp-cases"]',
    shape: "rect",
    pad: 4,
    title: {
      ko: "사례를 노드에 붙이기",
      en: "Anchor a case to a node"
    },
    body: {
      ko: "[사례] 탭에서 촉발·유지·보호·문화 요인을 채워 사례를 첨부합니다. 어디에 붙였는지가 사례개념화 품질의 단서가 됩니다.",
      en: "In the Cases tab, attach a case with precipitating · perpetuating · protective · cultural factors. Where you anchor it predicts conceptualization quality."
    }
  },
  {
    id: "record",
    targetSelector: '[data-tutorial="rec-button"]',
    shape: "rect",
    pad: 4,
    title: {
      ko: "내 경로 기록 + 정합도 확인",
      en: "Record your path & check alignment"
    },
    body: {
      ko: "REC를 켜고 노드를 순서대로 클릭하세요. 좌하단 게이지가 전문가 경로와의 실시간 정합도를 보여줍니다.",
      en: "Turn REC on and click nodes in order — the gauge at bottom-left shows live alignment with the closest expert path."
    }
  }
];

interface GraphResp {
  nodes: GraphNode[];
  edges: GraphEdge[];
  paths: Array<{ id: string; title: string; titleEn?: string; nodeSequence: string[] }>;
}

export default function App() {
  const auth = useAuth();
  const [data, setData] = useState<GraphResp | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [domainFilter, setDomainFilter] = useState<"all" | Domain>("all");
  const [bridgesOnly, setBridgesOnly] = useState(false);
  const [activePathId, setActivePathId] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string[] | null>(null);
  const [recording, setRecording] = useState(false);
  const [myPath, setMyPath] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("myPath") || "[]"); } catch { return []; }
  });
  const [err, setErr] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(() => {
    try { return (localStorage.getItem("lang") as Lang) || "ko"; } catch { return "ko"; }
  });
  const [entered, setEntered] = useState<boolean>(() => {
    try { return localStorage.getItem("entered") === "1"; } catch { return false; }
  });
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [activeDiscovery, setActiveDiscovery] = useState<DiscoveryPrompt | null>(null);
  // "engaged" = learner has experienced (clicked or been shown) at least one
  // discovery prompt. Until then, the cards pulse to draw attention.
  const [discoveryEngaged, setDiscoveryEngaged] = useState<boolean>(() => {
    try { return localStorage.getItem("discovery_engaged") === "1"; } catch { return false; }
  });
  const markDiscoveryEngaged = () => {
    setDiscoveryEngaged(true);
    try { localStorage.setItem("discovery_engaged", "1"); } catch {}
  };
  const handleDiscoverySelect = (p: DiscoveryPrompt | null) => {
    setActiveDiscovery((cur) => {
      const next = p && cur?.id === p.id ? null : p;
      if (next) void logEvent("discovery_prompt_open", { id: next.id, nodeCount: next.relatedNodeIds.length });
      else if (cur) void logEvent("discovery_prompt_close", { id: cur.id });
      return next;
    });
    if (p) {
      // Activating a discovery prompt clears any seed-path replay so the graph
      // shows a single coherent emphasis state.
      setActivePathId(null); setActivePath(null);
      // First contact (manual or auto) stops the pulse; the card has done its job.
      if (!discoveryEngaged) markDiscoveryEngaged();
    }
  };
  const handleDiscoveryClose = () => handleDiscoverySelect(null);
  const handleDiscoveryPlayPath = (pathId: string) => {
    const seed = data?.paths.find((p) => p.id === pathId);
    if (seed) {
      setActiveDiscovery(null);
      setActivePathId(seed.id);
      setActivePath(seed.nodeSequence);
      void logEvent("path_step", { pathId: seed.id, length: seed.nodeSequence.length, via: "discovery_prompt" });
    }
  };
  const openTutorial = () => {
    setTutorialStep(0);
    setTutorialOpen(true);
    void logEvent("tutorial_open", { trigger: "manual" });
  };
  const closeTutorial = () => {
    setTutorialOpen(false);
    let wasFirstClose = false;
    try {
      wasFirstClose = localStorage.getItem("tutorial_seen") !== "1";
      localStorage.setItem("tutorial_seen", "1");
    } catch {}
    void logEvent("tutorial_close", { atStep: tutorialStep });
    // First-visit follow-through: auto-activate the first discovery prompt so
    // a low-agency learner doesn't end the tutorial staring at an empty graph.
    if (wasFirstClose && DISCOVERY_PROMPTS.length > 0 && !activeDiscovery) {
      handleDiscoverySelect(DISCOVERY_PROMPTS[0]);
      void logEvent("discovery_prompt_open", {
        id: DISCOVERY_PROMPTS[0].id,
        nodeCount: DISCOVERY_PROMPTS[0].relatedNodeIds.length,
        trigger: "auto_after_tutorial"
      });
    }
  };
  const nextTutorial = () => setTutorialStep((s) => Math.min(TUTORIAL_STEPS.length - 1, s + 1));
  const prevTutorial = () => setTutorialStep((s) => Math.max(0, s - 1));
  const handleLangChange = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem("lang", l); } catch {}
    void logEvent("lang_change", { lang: l });
  };
  const handleEnter = () => {
    if (auth.authConfigured && !auth.user) return;
    setEntered(true);
    try { localStorage.setItem("entered", "1"); } catch {}
    void logEvent("landing_enter", { authed: !!auth.user });
  };

  // In auth mode, signing in *is* entry — no second click required.
  useEffect(() => {
    if (!auth.authConfigured || !auth.user || entered) return;
    setEntered(true);
    try { localStorage.setItem("entered", "1"); } catch {}
    void logEvent("landing_enter", { authed: true, via: "auto_post_login" });
  }, [auth.authConfigured, auth.user, entered]);
  const handleHome = () => {
    setEntered(false);
    try { localStorage.removeItem("entered"); } catch {}
    void logEvent("landing_enter", { via: "home_button" });
  };

  useEffect(() => {
    // In static (GitHub Pages) builds the Hono server isn't there; Vite's
    // import.meta.env.BASE_URL + "graph.json" serves the pre-dumped graph.
    // Dev + any server-backed build keeps using /api/graph.
    const staticMode = typeof __STATIC_MODE__ !== "undefined" && __STATIC_MODE__;
    const url = staticMode ? `${import.meta.env.BASE_URL}graph.json` : "/api/graph";
    fetch(url)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: GraphResp) => { setData(d); void logEvent("app_ready", { nodes: d.nodes.length, edges: d.edges.length }); })
      .catch((e) => setErr(String(e)));
  }, []);

  // Auto-launch the tutorial on a learner's first time inside the graph view
  // (delayed so the D3 force-sim has time to settle and the entry-hub circle
  // exists in the DOM for the spotlight to find).
  useEffect(() => {
    if (!entered || !data) return;
    let seen = false;
    try { seen = localStorage.getItem("tutorial_seen") === "1"; } catch {}
    if (seen) return;
    const id = window.setTimeout(() => {
      setTutorialStep(0);
      setTutorialOpen(true);
      void logEvent("tutorial_open", { trigger: "auto_first_visit" });
    }, 900);
    return () => window.clearTimeout(id);
  }, [entered, data]);

  const stats = useMemo(() => {
    if (!data) return null;
    return data.nodes.reduce<Record<string, number>>((acc, n) => {
      acc[n.domain] = (acc[n.domain] ?? 0) + 1; return acc;
    }, {});
  }, [data]);

  const handlePathSelect = (id: string | null, seq: string[] | null) => {
    setActivePathId(id); setActivePath(seq);
    if (id) void logEvent("path_step", { pathId: id, length: seq?.length });
  };

  const handleRecordStep = (nodeId: string) => {
    setMyPath((p) => {
      const next = p[p.length - 1] === nodeId ? p : [...p, nodeId];
      try { localStorage.setItem("myPath", JSON.stringify(next)); } catch {}
      void logEvent("mypath_step", { nodeId, length: next.length });
      return next;
    });
  };
  const handleClearMyPath = () => {
    setMyPath([]);
    try { localStorage.removeItem("myPath"); } catch {}
  };
  const handleToggleRecording = () => {
    setRecording((r) => {
      const next = !r;
      void logEvent("recording_toggle", { on: next });
      return next;
    });
  };

  // Auth required when Supabase is configured (full app mode); static mode bypasses.
  const requireAuth = auth.authConfigured;
  if (!entered || (requireAuth && !auth.user)) {
    return (
      <Landing
        stats={data ? { nodes: data.nodes.length, edges: data.edges.length, paths: data.paths.length } : null}
        onEnter={handleEnter}
        lang={lang}
        onLangChange={handleLangChange}
        authRequired={requireAuth}
        authLoading={auth.loading}
        user={auth.user}
        onSignIn={auth.signIn}
      />
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      <TitleBar
        subtitle={data ? `${data.nodes.length} nodes · ${data.edges.length} edges · ${data.paths.length} paths` : "Loading…"}
        domainFilter={domainFilter}
        onDomainChange={(d) => { setDomainFilter(d); void logEvent("filter_change", { domain: d }); }}
        bridgesOnly={bridgesOnly}
        onBridgesOnlyChange={(v) => { setBridgesOnly(v); void logEvent("filter_change", { bridgesOnly: v }); }}
        lang={lang}
        onLangChange={handleLangChange}
        onHome={handleHome}
        onTutorial={openTutorial}
        userEmail={auth.user?.email ?? null}
        onSignOut={async () => {
          await auth.signOut();
          setEntered(false);
          try { localStorage.removeItem("entered"); } catch {}
        }}
      />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar
          stats={stats}
          paths={data?.paths ?? []}
          domainFilter={domainFilter}
          onDomainChange={(d) => { setDomainFilter(d); void logEvent("filter_change", { domain: d }); }}
          activePathId={activePathId}
          onPathSelect={handlePathSelect}
          recording={recording}
          onToggleRecording={handleToggleRecording}
          myPath={myPath}
          onClearMyPath={handleClearMyPath}
          nodeLookup={new Map((data?.nodes ?? []).map(n => [n.id, (lang === "en" && n.labelEn) ? n.labelEn : n.labelKo]))}
          discoveryPrompts={DISCOVERY_PROMPTS}
          activeDiscoveryId={activeDiscovery?.id ?? null}
          onDiscoverySelect={handleDiscoverySelect}
          discoveryPulse={!discoveryEngaged}
          lang={lang}
        />
        <main style={{ position: "relative", flex: 1, overflow: "hidden" }}>
          {err ? (
            <div style={{ padding: 24, color: "var(--clinical)" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>API error</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{err}</div>
            </div>
          ) : data ? (
            <>
              <GraphCanvas
                nodes={data.nodes}
                edges={data.edges}
                domainFilter={domainFilter}
                bridgesOnly={bridgesOnly}
                activePath={activePath}
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
                recording={recording}
                onRecordStep={handleRecordStep}
                myPath={myPath}
                discoveryNodes={activeDiscovery?.relatedNodeIds ?? null}
                lang={lang}
              />
              <DiscoveryPromptPanel
                prompt={activeDiscovery}
                onClose={handleDiscoveryClose}
                onPlayPath={handleDiscoveryPlayPath}
                lang={lang}
              />
              <AlignmentGauge myPath={myPath} seedPaths={data.paths} lang={lang} />
              <NodeDetailPanel node={selected} onClose={() => setSelected(null)} lang={lang} />
            </>
          ) : (
            <div style={{ padding: 24, color: "var(--text-secondary)", fontSize: 13 }}>
              Loading graph…
            </div>
          )}
        </main>
      </div>
      <TutorialOverlay
        open={tutorialOpen}
        steps={TUTORIAL_STEPS}
        step={tutorialStep}
        onPrev={prevTutorial}
        onNext={nextTutorial}
        onClose={closeTutorial}
        lang={lang}
      />
    </div>
  );
}
