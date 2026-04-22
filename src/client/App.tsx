import { useEffect, useMemo, useState } from "react";
declare const __STATIC_MODE__: boolean;
import "./styles.css";
import { GraphCanvas, type GraphNode, type GraphEdge, type Domain } from "./components/GraphCanvas";
import { NodeDetailPanel } from "./components/NodeDetailPanel";
import { Sidebar } from "./components/Sidebar";
import { TitleBar, type Lang } from "./components/TitleBar";
import { Landing } from "./components/Landing";
import { AlignmentGauge } from "./components/AlignmentGauge";
import { logEvent } from "./lib/eventLogger";

interface GraphResp {
  nodes: GraphNode[];
  edges: GraphEdge[];
  paths: Array<{ id: string; title: string; nodeSequence: string[] }>;
}

export default function App() {
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
  const handleLangChange = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem("lang", l); } catch {}
    void logEvent("lang_change", { lang: l });
  };
  const handleEnter = () => {
    setEntered(true);
    try { localStorage.setItem("entered", "1"); } catch {}
    void logEvent("landing_enter", {});
  };
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

  if (!entered) {
    return <Landing stats={data ? { nodes: data.nodes.length, edges: data.edges.length, paths: data.paths.length } : null} onEnter={handleEnter} lang={lang} onLangChange={handleLangChange} />;
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
    </div>
  );
}
