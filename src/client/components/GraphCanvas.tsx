import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { logEvent } from "../lib/eventLogger";

export type Domain = "counseling" | "clinical" | "shared";
export type Level = "top_hub" | "mid_hub" | "concept";

export interface GraphNode {
  id: string;
  domain: Domain;
  level: Level;
  labelKo: string;
  labelEn?: string;
  description?: string;
  descriptionEn?: string;
  parentHubId?: string | null;
}
export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relation: string;
}

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  domainFilter: "all" | Domain;
  bridgesOnly: boolean;
  activePath: string[] | null;         // ordered node ids (seed path replay)
  selectedId: string | null;
  onSelect: (node: GraphNode) => void;
  recording?: boolean;                 // B8 — append clicks to myPath
  onRecordStep?: (nodeId: string) => void;
  myPath?: string[] | null;            // B8 — user's recorded path
  lang?: "ko" | "en";
}

type SimNode = GraphNode & d3.SimulationNodeDatum;
type SimLink = d3.SimulationLinkDatum<SimNode> & { relation: string };

const DOMAIN_COLOR: Record<Domain, string> = {
  counseling: "#5b8def",
  clinical:   "#e5695b",
  shared:     "#8b6fd9"
};

/** §1-2 / §2-2 — "특히 중요한 중간 허브" */
const KEY_HUBS = new Set<string>([
  // counseling §1-2
  "c_problem_areas", "c_counseling_process", "c_counseling_theories",
  "c_educational_context", "c_career_life_design",
  // clinical §2-2
  "cl_psychopathology", "cl_clinical_assessment", "cl_case_conceptualization",
  "cl_risk_crisis", "cl_evidence_based_practice"
]);

/** §1-2 / §2-2 — 학생 탐색 시작점 */
const ENTRY_HUBS = new Set<string>(["c_problem_areas", "cl_psychopathology"]);

/** §4 — 상담심리는 "문제영역"과 "교육맥락"을 상대적으로 크게 */
const COUNSELING_IDENTITY_HUBS = new Set<string>(["c_problem_areas", "c_educational_context"]);

function baseRadius(d: SimNode): number {
  if (d.level === "concept") return 6;
  if (d.level === "mid_hub") return 14;
  // top_hub
  let r = 20;
  if (KEY_HUBS.has(d.id)) r += 5;
  if (COUNSELING_IDENTITY_HUBS.has(d.id)) r += 3;
  if (ENTRY_HUBS.has(d.id)) r += 2;
  return r;
}

export function GraphCanvas({
  nodes, edges, domainFilter, bridgesOnly, activePath, selectedId, onSelect,
  recording, onRecordStep, myPath, lang = "ko"
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // B6 — seed path step-through index (-1 = inactive, 0..n-1 = revealed through this index)
  const [pathStep, setPathStep] = useState(0);
  // B3 — keep a handle on the live simulation so a second effect can restart it
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  // B8 — keep recording flag in a ref so the click handler (bound inside a
  //       useEffect with stale deps) always sees the latest value.
  const recordingRef = useRef<boolean>(false);
  useEffect(() => { recordingRef.current = !!recording; }, [recording]);
  // mid-zoom label density — track live zoom k, hover, and current selection so
  // concept labels can be revealed contextually (selected/hovered + 1-hop).
  const kRef = useRef<number>(1);
  const hoverIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const applyTierRef = useRef<(() => void) | null>(null);
  useEffect(() => { selectedIdRef.current = selectedId; applyTierRef.current?.(); }, [selectedId]);

  useEffect(() => {
    const svg = d3.select(svgRef.current!);
    svg.selectAll("*").remove();

    const width = svgRef.current!.clientWidth;
    const height = svgRef.current!.clientHeight;

    const visibleNodes: SimNode[] = nodes
      .filter((n) => domainFilter === "all" || n.domain === domainFilter || n.domain === "shared")
      .map((n) => ({ ...n }));
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const visibleLinks: SimLink[] = edges
      .filter((e) => visibleIds.has(e.sourceId) && visibleIds.has(e.targetId))
      .map((e) => ({ source: e.sourceId, target: e.targetId, relation: e.relation }));

    // ------- defs: pulse for entry hubs -------
    const defs = svg.append("defs");
    defs.append("filter")
      .attr("id", "soft-glow")
      .attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%")
      .html(`<feGaussianBlur stdDeviation="3.5" result="b"/>
             <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>`);

    const g = svg.append("g");

    // B1 — tier logic extracted so we can apply it immediately on mount,
    //       not only after the first zoom event.
    const applyTier = (kArg?: number) => {
      const k = kArg ?? kRef.current;
      kRef.current = k;
      // mid-zoom contextual concept labels: at 1.0 <= k < 1.6, reveal concept
      // labels belonging to the hub the user is selecting/hovering (1-hop).
      const contextSet = new Set<string>();
      const anchors = [selectedIdRef.current, hoverIdRef.current].filter(Boolean) as string[];
      if (k >= 1.0 && k < 1.6 && anchors.length) {
        anchors.forEach((id) => {
          contextSet.add(id);
          visibleLinks.forEach((l) => {
            const s = typeof l.source === "object" ? (l.source as SimNode).id : (l.source as string);
            const t = typeof l.target === "object" ? (l.target as SimNode).id : (l.target as string);
            if (s === id) contextSet.add(t);
            if (t === id) contextSet.add(s);
          });
        });
      }
      g.selectAll<SVGTextElement, SimNode>("text.label")
        .style("display", (d) => {
          if (d.level === "top_hub") return "inline";
          if (d.level === "mid_hub") return k > 0.8 ? "inline" : "none";
          if (k > 1.6) return "inline";
          if (contextSet.has(d.id)) return "inline";
          return "none";
        });
      g.selectAll<SVGCircleElement, SimNode>("circle.node")
        .attr("r", (d) => {
          const base = baseRadius(d);
          if (d.level !== "concept") return base;
          if (k < 0.5) return base * 0.5;
          if (k < 1.0) return base * 0.75;
          return base;
        })
        .attr("fill-opacity", (d) => {
          if (d.level !== "concept") return 0.95;
          if (k < 0.5) return 0.35;
          if (k < 1.0) return 0.7;
          return 0.95;
        });
    };
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .filter((ev) => {
        if (ev.type === "wheel") return true;
        const target = ev.target as Element | null;
        return !target?.closest?.(".node-group");
      })
      .on("zoom", (ev) => {
        g.attr("transform", ev.transform.toString());
        applyTier(ev.transform.k);
      });
    applyTierRef.current = () => applyTier();
    svg.call(zoom);

    // ------- links -------
    const link = g.append("g")
      .attr("stroke-opacity", 0.38)
      .selectAll("line")
      .data(visibleLinks)
      .enter().append("line")
      .attr("class", (d) => `edge edge-${d.relation}`)
      .attr("stroke", (d) => d.relation === "bridges_to" ? "#8b6fd9" : "#94a3b8")
      .attr("stroke-width", (d) => d.relation === "bridges_to" ? 1.8 : 1)
      .attr("stroke-dasharray", (d) => d.relation === "bridges_to" ? "5,3" : null)
      .on("click", (_e, d) => {
        const src = typeof d.source === "object" ? (d.source as SimNode).id : d.source;
        const tgt = typeof d.target === "object" ? (d.target as SimNode).id : d.target;
        void logEvent("edge_click", { source: src, target: tgt, relation: d.relation });
      });

    // ------- B7: virtual path-edge layer (drawn ABOVE core edges, BELOW nodes) -------
    //         Used by both seed path replay and user's recorded path.
    const pathLayer = g.append("g").attr("class", "path-layer");
    defs.append("marker")
      .attr("id", "path-arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 9).attr("refY", 0)
      .attr("markerWidth", 6).attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#1d4ed8");
    defs.append("marker")
      .attr("id", "mypath-arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 9).attr("refY", 0)
      .attr("markerWidth", 6).attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#10b981");

    // ------- nodes -------
    const node = g.append("g")
      .selectAll("g.node-group")
      .data(visibleNodes)
      .enter().append("g")
      .attr("class", (d) =>
        `node-group node-${d.level}${KEY_HUBS.has(d.id) ? " node-key" : ""}${ENTRY_HUBS.has(d.id) ? " node-entry" : ""}`)
      .style("cursor", "pointer")
      .on("click", (_e, d) => {
        void logEvent("node_open", { nodeId: d.id, level: d.level, domain: d.domain });
        if (recordingRef.current && onRecordStep) onRecordStep(d.id);
        onSelect(d);
      })
      .on("mouseenter", (_e, d) => { hoverIdRef.current = d.id; applyTierRef.current?.(); })
      .on("mouseleave", () => { hoverIdRef.current = null; applyTierRef.current?.(); });

    // Entry-hub pulse ring (§1-2 / §2-2 시작점)
    node.filter((d) => ENTRY_HUBS.has(d.id))
      .append("circle")
      .attr("class", "pulse-ring")
      .attr("r", (d) => baseRadius(d) + 4)
      .attr("fill", "none")
      .attr("stroke", (d) => DOMAIN_COLOR[d.domain])
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.6)
      .attr("filter", "url(#soft-glow)");

    // Main circle
    node.append("circle")
      .attr("class", "node")
      .attr("r", (d) => baseRadius(d))
      .attr("fill", (d) => DOMAIN_COLOR[d.domain])
      .attr("stroke", (d) => KEY_HUBS.has(d.id) ? "rgba(15,23,42,0.20)" : "rgba(255,255,255,0.7)")
      .attr("stroke-width", (d) => KEY_HUBS.has(d.id) ? 2 : 1);

    // Entry-hub marker: white core dot
    node.filter((d) => ENTRY_HUBS.has(d.id))
      .append("circle")
      .attr("r", 3)
      .attr("fill", "#fff")
      .attr("pointer-events", "none");

    node.append("text")
      .attr("class", "label")
      .attr("dy", (d) => -baseRadius(d) - 5)
      .attr("text-anchor", "middle")
      .attr("font-size", (d) =>
        d.level === "top_hub" ? (KEY_HUBS.has(d.id) ? 14 : 13) : d.level === "mid_hub" ? 11 : 10)
      .attr("font-weight", (d) => KEY_HUBS.has(d.id) ? 600 : 500)
      .attr("pointer-events", "none")
      .text((d) => (lang === "en" && d.labelEn ? d.labelEn : d.labelKo));

    // ------- simulation -------
    const sim = d3.forceSimulation<SimNode>(visibleNodes)
      .force("link", d3.forceLink<SimNode, SimLink>(visibleLinks)
        .id((d) => d.id)
        .distance((l) => l.relation === "bridges_to" ? 150 : 58)
        .strength((l) => l.relation === "bridges_to" ? 0.28 : 0.8))
      .force("charge", d3.forceManyBody<SimNode>()
        .strength((d) =>
          d.level === "top_hub" ? (KEY_HUBS.has(d.id) ? -420 : -320) :
          d.level === "mid_hub" ? -110 : -55)
        .distanceMax(420))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide<SimNode>().radius((d) => baseRadius(d) + 3).strength(0.9))
      .force("x", d3.forceX<SimNode>(width / 2).strength(0.04))
      .force("y", d3.forceY<SimNode>(height / 2).strength(0.04))
      .on("tick", () => {
        link
          .attr("x1", (d) => (d.source as SimNode).x!)
          .attr("y1", (d) => (d.source as SimNode).y!)
          .attr("x2", (d) => (d.target as SimNode).x!)
          .attr("y2", (d) => (d.target as SimNode).y!);
        node.attr("transform", (d) => `translate(${d.x},${d.y})`);
        // B7 — reposition virtual path arrows using live sim coords
        pathLayer.selectAll<SVGLineElement, { s: SimNode; t: SimNode }>("line.virt")
          .attr("x1", (d) => d.s.x!).attr("y1", (d) => d.s.y!)
          .attr("x2", (d) => d.t.x!).attr("y2", (d) => d.t.y!);
      });

    // Entry pulse — CSS animation on the ring itself (no rAF leaks).

    // ------- drag -------
    const drag = d3.drag<SVGGElement, SimNode>()
      .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; });
    node.call(drag);

    // B1 — apply tier immediately at initial zoom k=1 so the canvas isn't
    //      cluttered with 170+ concept labels before the user zooms.
    applyTier(1);

    // ------- emphasis application (bridgesOnly / activePath / selection) -------
    applyEmphasis(g, {
      bridgesOnly, activePath, selectedId, myPath: myPath ?? null,
      pathStep, nodeIndex: new Map(visibleNodes.map((n) => [n.id, n])),
      edges: visibleLinks
    });

    simRef.current = sim;
    return () => { sim.stop(); simRef.current = null; };
  }, [nodes, edges, domainFilter]);

  // B3 — when bridges mode is ON, pin the 9 shared hubs to a central circle so
  //       students can read §3-1 contrasts in one glance. Release on OFF.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const width = svgRef.current!.clientWidth;
    const height = svgRef.current!.clientHeight;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.18;

    const sharedNodes = (sim.nodes() as SimNode[]).filter((n) => n.domain === "shared");
    if (bridgesOnly) {
      sharedNodes.forEach((n, i) => {
        const a = (i / sharedNodes.length) * Math.PI * 2 - Math.PI / 2;
        n.fx = cx + Math.cos(a) * radius;
        n.fy = cy + Math.sin(a) * radius;
      });
    } else {
      sharedNodes.forEach((n) => { n.fx = null; n.fy = null; });
    }
    sim.alpha(0.6).restart();
  }, [bridgesOnly]);

  // B6 — reset step to 0 whenever a new seed path begins or ends
  useEffect(() => {
    setPathStep(activePath ? 0 : 0);
  }, [activePath]);

  // B6 — step playback: advance every 1500ms while activePath is live
  useEffect(() => {
    if (!activePath) return;
    if (pathStep >= activePath.length - 1) return;
    const t = setTimeout(() => setPathStep((s) => s + 1), 1500);
    return () => clearTimeout(t);
  }, [activePath, pathStep]);

  // Swap label text when language toggles (no re-layout)
  useEffect(() => {
    const svg = d3.select(svgRef.current!);
    svg.selectAll<SVGTextElement, SimNode>("text.label")
      .text((d) => (lang === "en" && d.labelEn ? d.labelEn : d.labelKo));
  }, [lang]);

  // Re-apply emphasis without re-building layout
  useEffect(() => {
    const svg = d3.select(svgRef.current!);
    const g = svg.select<SVGGElement>("g");
    if (g.empty()) return;
    const visibleLinks: Array<{ source: string | number | SimNode; target: string | number | SimNode; relation: string }> = [];
    g.selectAll<SVGLineElement, SimLink>("line.edge").each(function (d) { visibleLinks.push(d); });
    const nodeIndex = new Map<string, SimNode>();
    g.selectAll<SVGGElement, SimNode>(".node-group").each(function (d) { nodeIndex.set(d.id, d); });
    applyEmphasis(g, {
      bridgesOnly, activePath, selectedId, myPath: myPath ?? null,
      pathStep, nodeIndex, edges: visibleLinks
    });
  }, [bridgesOnly, activePath, selectedId, pathStep, myPath]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg ref={svgRef} className="graph" style={{ width: "100%", height: "100%", background: "transparent" }} />
      {activePath ? (
        <div style={{
          position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
          display: "flex", alignItems: "center", gap: 10,
          padding: "6px 12px", borderRadius: 999,
          background: "var(--glass-strong, rgba(255,255,255,0.75))",
          border: "1px solid var(--border-soft, rgba(15,23,42,0.1))",
          backdropFilter: "saturate(150%) blur(12px)",
          boxShadow: "0 4px 18px rgba(15,23,42,0.08)",
          fontSize: 12, color: "var(--text-secondary)", zIndex: 5
        }}>
          <button
            onClick={() => setPathStep((s) => Math.max(0, s - 1))}
            disabled={pathStep <= 0}
            className="segment"
            style={{ padding: "2px 8px" }}
          >◀</button>
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
            Step {pathStep + 1} / {activePath.length}
          </span>
          <button
            onClick={() => setPathStep((s) => Math.min(activePath.length - 1, s + 1))}
            disabled={pathStep >= activePath.length - 1}
            className="segment"
            style={{ padding: "2px 8px" }}
          >▶</button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Neighbor highlight (Collins & Loftus spreading activation),
 * bridges-only overlay (§3-1 C5), active-path replay (§1-4/§2-4 worked example).
 */
function applyEmphasis(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  opts: {
    bridgesOnly: boolean;
    activePath: string[] | null;
    selectedId: string | null;
    myPath: string[] | null;
    pathStep: number;
    nodeIndex: Map<string, SimNode>;
    edges: Array<{ source: string | number | SimNode; target: string | number | SimNode; relation: string }>;
  }
) {
  const { bridgesOnly, activePath, selectedId, myPath, pathStep, nodeIndex, edges } = opts;

  // B6 — only nodes up to & including pathStep count as "revealed"
  const revealed = activePath ? activePath.slice(0, pathStep + 1) : [];
  const pathSet = activePath ? new Set(activePath) : null;
  const revealedSet = new Set(revealed);
  const pathEdgeSet = new Set<string>();
  if (activePath) {
    for (let i = 0; i < activePath.length - 1; i++) {
      pathEdgeSet.add(`${activePath[i]}|${activePath[i + 1]}`);
      pathEdgeSet.add(`${activePath[i + 1]}|${activePath[i]}`);
    }
  }

  // B7 — draw virtual path-edge lines between consecutive nodes
  const pathLayer = g.select<SVGGElement>("g.path-layer");
  const virtualLinks: Array<{ s: SimNode; t: SimNode; revealed: boolean; kind: "seed" | "my" }> = [];
  if (activePath) {
    for (let i = 0; i < activePath.length - 1; i++) {
      const s = nodeIndex.get(activePath[i]);
      const t = nodeIndex.get(activePath[i + 1]);
      if (s && t) virtualLinks.push({ s, t, revealed: i < pathStep, kind: "seed" });
    }
  }
  if (myPath && myPath.length > 1) {
    for (let i = 0; i < myPath.length - 1; i++) {
      const s = nodeIndex.get(myPath[i]);
      const t = nodeIndex.get(myPath[i + 1]);
      if (s && t) virtualLinks.push({ s, t, revealed: true, kind: "my" });
    }
  }
  const virt = pathLayer.selectAll<SVGLineElement, typeof virtualLinks[number]>("line.virt")
    .data(virtualLinks, (_d, i) => i as unknown as string);
  virt.exit().remove();
  const virtEnter = virt.enter().append("line").attr("class", "virt");
  virtEnter.merge(virt as any)
    .attr("x1", (d) => d.s.x ?? 0).attr("y1", (d) => d.s.y ?? 0)
    .attr("x2", (d) => d.t.x ?? 0).attr("y2", (d) => d.t.y ?? 0)
    .attr("stroke", (d) => d.kind === "my" ? "#10b981" : "#1d4ed8")
    .attr("stroke-width", (d) => d.revealed ? 4 : 0)
    .attr("stroke-opacity", (d) => d.revealed ? 1 : 0)
    .attr("stroke-dasharray", (d) => d.kind === "my" ? "6,4" : null)
    .attr("stroke-linecap", "round")
    .attr("marker-end", (d) => d.revealed ? `url(#${d.kind === "my" ? "mypath" : "path"}-arrow)` : null)
    .attr("pointer-events", "none")
    .style("filter", (d) => d.revealed && d.kind === "seed" ? "drop-shadow(0 0 6px rgba(29,78,216,0.6))" : null)
    .style("transition", "stroke-width 260ms ease, stroke-opacity 260ms ease");

  // Compute neighbor set for selected. If selection is no longer in the visible
  // graph (e.g. after a domain-filter change), fall back to no emphasis.
  const neighborSet = new Set<string>();
  let selectionVisible = false;
  if (selectedId) {
    const visibleIds = new Set<string>();
    g.selectAll<SVGGElement, SimNode>(".node-group").each((d) => { visibleIds.add(d.id); });
    selectionVisible = visibleIds.has(selectedId);
    if (selectionVisible) {
      neighborSet.add(selectedId);
      edges.forEach((e) => {
        const s = typeof e.source === "object" ? (e.source as SimNode).id : String(e.source);
        const t = typeof e.target === "object" ? (e.target as SimNode).id : String(e.target);
        if (s === selectedId) neighborSet.add(t);
        if (t === selectedId) neighborSet.add(s);
      });
    }
  }
  const effectiveSelectedId = selectionVisible ? selectedId : null;

  const dimmed = 0.12;

  g.selectAll<SVGGElement, SimNode>(".node-group")
    .style("opacity", (d) => {
      if (pathSet) {
        if (revealedSet.has(d.id)) return 1;
        if (pathSet.has(d.id)) return 0.35;   // future steps: ghost-visible
        return dimmed;
      }
      if (bridgesOnly) {
        if (d.domain === "shared") return 1;
        return d.level === "top_hub" ? 0.55 : dimmed;
      }
      if (effectiveSelectedId) return neighborSet.has(d.id) ? 1 : dimmed;
      return 1;
    });

  g.selectAll<SVGLineElement, SimLink>("line")
    .style("opacity", (d) => {
      const s = typeof d.source === "object" ? (d.source as SimNode).id : d.source;
      const t = typeof d.target === "object" ? (d.target as SimNode).id : d.target;
      if (pathSet) return pathEdgeSet.has(`${s}|${t}`) ? 1 : dimmed * 0.5;
      if (bridgesOnly) return d.relation === "bridges_to" ? 1 : dimmed * 0.4;
      if (effectiveSelectedId) return (s === effectiveSelectedId || t === effectiveSelectedId) ? 1 : dimmed * 0.5;
      return 1;
    })
    .style("stroke-width", (d) => {
      if (pathSet && pathEdgeSet.has(
        `${typeof d.source === "object" ? (d.source as SimNode).id : d.source}|${typeof d.target === "object" ? (d.target as SimNode).id : d.target}`
      )) return 2.5;
      return d.relation === "bridges_to" ? 1.8 : 1;
    });
}
