import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { Lang } from "./TitleBar";
import type { User } from "@supabase/supabase-js";

interface Props {
  stats: { nodes: number; edges: number; paths: number } | null;
  onEnter: () => void;
  lang: Lang;
  onLangChange: (l: Lang) => void;
  authRequired: boolean;
  authLoading: boolean;
  user: User | null;
  onSignIn: (email: string, password: string) => Promise<{ error?: string }>;
}

const COPY = {
  ko: {
    eyebrow: "CSCL · Knowledge Graph",
    title: "상담심리 × 임상심리",
    titleSub: "하나의 지도로 읽는 두 개의 전문 정체성",
    lede:
      "학부·대학원 상담/임상심리 교육과정의 핵심 허브·개념·브릿지를 그래프로 구조화했습니다. 클릭·탐색·경로 기록이 모두 학습 데이터로 남아, 개인의 인지 지도를 전문가의 지도와 비교합니다.",
    pillars: [
      { label: "C1 · Bridge ontology", desc: "상담↔임상 공통 허브를 Delphi·카드소트로 검증" },
      { label: "C2 · Path signatures", desc: "탐색 경로를 전문성의 대리지표로" },
      { label: "C3 · Case anchoring", desc: "사례 첨부 위치가 사례개념화 품질을 예측" },
      { label: "S5 · Mirror Mode", desc: "실시간 전문가-정합도 게이지" }
    ],
    cta: "그래프 열기",
    subCta: "Phase 0 · 로컬 · v0.0.1",
    how: [
      "① 진입 허브를 선택해 도메인을 고른다",
      "② 씨앗 경로를 따라 전문가의 사고 순서를 본다",
      "③ ⏺ REC로 내 경로를 기록 — 좌하단 게이지로 정합도를 확인"
    ],
    statsLabel: (n: number, e: number, p: number) => `노드 ${n} · 엣지 ${e} · 씨앗 경로 ${p}`,
    loading: "그래프 준비 중…",
    auth: {
      title: "로그인",
      lede: "이 도구는 닫힌 코호트용입니다. 발급받은 계정으로만 입장할 수 있어요.",
      email: "이메일",
      password: "비밀번호",
      submit: "로그인",
      submitting: "로그인 중…",
      noAccount: "계정이 없으신가요? 강의자에게 문의해 주세요.",
      welcome: (email: string) => `${email} 으로 로그인되었습니다`,
      signOut: "로그아웃"
    }
  },
  en: {
    eyebrow: "CSCL · Knowledge Graph",
    title: "Counseling × Clinical Psychology",
    titleSub: "Two professional identities on one map",
    lede:
      "A structured knowledge graph of core hubs, concepts, and cross-domain bridges for counseling & clinical psychology curricula. Every click, path, and annotation becomes learning data — comparing a learner's cognitive map against the expert map.",
    pillars: [
      { label: "C1 · Bridge ontology", desc: "Shared hubs validated via Delphi & card-sort" },
      { label: "C2 · Path signatures", desc: "Traversals as proxies for expertise" },
      { label: "C3 · Case anchoring", desc: "Where a case is attached predicts conceptualization quality" },
      { label: "S5 · Mirror Mode", desc: "Live alignment gauge to expert reference" }
    ],
    cta: "Enter the graph",
    subCta: "Phase 0 · local · v0.0.1",
    how: [
      "1. Pick an entry hub to choose a domain",
      "2. Follow a seed path to see the expert's order of reasoning",
      "3. Hit ⏺ REC to record your own path — watch the alignment gauge at bottom-left"
    ],
    statsLabel: (n: number, e: number, p: number) => `${n} nodes · ${e} edges · ${p} seed paths`,
    loading: "Loading graph…",
    auth: {
      title: "Sign in",
      lede: "This tool is for a closed cohort. Sign in with the account issued to you.",
      email: "Email",
      password: "Password",
      submit: "Sign in",
      submitting: "Signing in…",
      noAccount: "No account? Contact your instructor.",
      welcome: (email: string) => `Signed in as ${email}`,
      signOut: "Sign out"
    }
  }
} as const;

export function Landing({
  stats,
  onEnter,
  lang,
  onLangChange,
  authRequired,
  authLoading,
  user,
  onSignIn
}: Props) {
  const t = COPY[lang];
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const needsLogin = authRequired && !user;
  const canEnter = !!stats && (!authRequired || !!user);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || submitting) return;
    setAuthError(null);
    setSubmitting(true);
    const { error } = await onSignIn(email.trim(), password);
    setSubmitting(false);
    if (error) setAuthError(error);
    else setPassword("");
  };

  useEffect(() => {
    const svg = d3.select(svgRef.current!);
    svg.selectAll("*").remove();
    const W = () => svgRef.current!.clientWidth;
    const H = () => svgRef.current!.clientHeight;

    type N = d3.SimulationNodeDatum & { id: string; group: "co" | "cl" | "sh"; r: number };
    type L = d3.SimulationLinkDatum<N> & { bridge?: boolean };

    const DOMAINS: Array<N["group"]> = ["co", "cl", "sh"];
    const COLOR: Record<N["group"], string> = { co: "#5b8def", cl: "#e5695b", sh: "#8b6fd9" };

    const nodes: N[] = [];
    DOMAINS.forEach((g, i) => {
      nodes.push({ id: `${g}_hub`, group: g, r: 14 + Math.random() * 3, x: W() * (0.25 + i * 0.25), y: H() * 0.5 });
      for (let k = 0; k < 7; k++) {
        nodes.push({ id: `${g}_${k}`, group: g, r: 3 + Math.random() * 3 });
      }
    });
    const links: L[] = [];
    DOMAINS.forEach((g) => {
      for (let k = 0; k < 7; k++) links.push({ source: `${g}_hub`, target: `${g}_${k}` });
    });
    links.push({ source: "co_hub", target: "sh_hub", bridge: true });
    links.push({ source: "cl_hub", target: "sh_hub", bridge: true });
    links.push({ source: "co_hub", target: "cl_hub", bridge: true });
    for (let k = 0; k < 4; k++) {
      const a = DOMAINS[Math.floor(Math.random() * 3)];
      const b = DOMAINS[Math.floor(Math.random() * 3)];
      if (a !== b) links.push({ source: `${a}_${Math.floor(Math.random() * 7)}`, target: `${b}_${Math.floor(Math.random() * 7)}`, bridge: true });
    }

    const g = svg.append("g");
    const link = g.append("g")
      .selectAll("line").data(links).enter().append("line")
      .attr("stroke", (d) => d.bridge ? "rgba(139,111,217,0.55)" : "rgba(15,23,42,0.12)")
      .attr("stroke-width", (d) => d.bridge ? 1.4 : 0.9)
      .attr("stroke-dasharray", (d) => d.bridge ? "4,3" : null);

    const node = g.append("g")
      .selectAll("circle").data(nodes).enter().append("circle")
      .attr("r", (d) => d.r)
      .attr("fill", (d) => COLOR[d.group])
      .attr("fill-opacity", 0.85)
      .attr("stroke", "rgba(255,255,255,0.85)")
      .attr("stroke-width", 1.2)
      .style("filter", "drop-shadow(0 4px 10px rgba(15,23,42,0.10))");

    // gentle pulse on hubs
    node.filter((d) => d.id.endsWith("_hub"))
      .append("title").text((d) => d.group);

    const sim = d3.forceSimulation<N>(nodes)
      .force("link", d3.forceLink<N, L>(links).id((d) => d.id).distance((l) => l.bridge ? 160 : 48).strength(0.4))
      .force("charge", d3.forceManyBody<N>().strength((d) => d.id.endsWith("_hub") ? -320 : -60))
      .force("center", d3.forceCenter(W() / 2, H() / 2))
      .force("collide", d3.forceCollide<N>().radius((d) => d.r + 4))
      .alphaDecay(0.02)
      .on("tick", () => {
        link
          .attr("x1", (d) => (d.source as N).x!)
          .attr("y1", (d) => (d.source as N).y!)
          .attr("x2", (d) => (d.target as N).x!)
          .attr("y2", (d) => (d.target as N).y!);
        node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);
      });

    // keep simulation gently alive for a floating feel
    const reheat = window.setInterval(() => { sim.alpha(0.25).restart(); }, 4200);

    // cursor parallax — nudge the nearest hub toward the mouse
    const onMove = (e: MouseEvent) => {
      const rect = svgRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let best: N | null = null; let bd = Infinity;
      for (const n of nodes) {
        if (!n.id.endsWith("_hub")) continue;
        const dx = (n.x ?? 0) - mx; const dy = (n.y ?? 0) - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = n; }
      }
      if (best && bd < 220 * 220) {
        best.vx = (best.vx ?? 0) + (mx - (best.x ?? 0)) * 0.002;
        best.vy = (best.vy ?? 0) + (my - (best.y ?? 0)) * 0.002;
        sim.alpha(0.15).restart();
      }
    };
    window.addEventListener("mousemove", onMove, { passive: true });

    const onResize = () => { sim.force("center", d3.forceCenter(W() / 2, H() / 2)); sim.alpha(0.3).restart(); };
    window.addEventListener("resize", onResize);

    return () => {
      sim.stop();
      window.clearInterval(reheat);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "radial-gradient(1200px 800px at 20% 10%, rgba(91,141,239,0.18), transparent 60%),"
                + "radial-gradient(1000px 700px at 85% 85%, rgba(229,105,91,0.16), transparent 55%),"
                + "radial-gradient(900px 600px at 65% 20%, rgba(139,111,217,0.14), transparent 55%),"
                + "linear-gradient(180deg, #fafbff 0%, #f0f3fb 100%)",
      overflow: "auto"
    }}>
      <svg
        ref={svgRef}
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          pointerEvents: "none",
          opacity: 0.75, mixBlendMode: "multiply"
        }}
        aria-hidden
      />
      <div style={{
        position: "absolute", top: 18, right: 20, display: "flex", gap: 6, zIndex: 2
      }}>
        <div className="segmented">
          <button className={`segment ${lang === "ko" ? "active" : ""}`} onClick={() => onLangChange("ko")}>한</button>
          <button className={`segment ${lang === "en" ? "active" : ""}`} onClick={() => onLangChange("en")}>EN</button>
        </div>
      </div>

      <div style={{
        maxWidth: 1040, margin: "0 auto",
        padding: "80px 32px 64px",
        display: "grid", gap: 40,
        position: "relative", zIndex: 1
      }}>
        <header style={{ display: "grid", gap: 14 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "var(--text-tertiary)"
          }}>{t.eyebrow}</div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: 52, fontWeight: 600,
            lineHeight: 1.05, letterSpacing: "-0.025em",
            margin: 0, color: "var(--text-primary)",
            background: "linear-gradient(135deg, #5b8def 0%, #8b6fd9 50%, #e5695b 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text"
          }}>{t.title}</h1>
          <div style={{
            fontSize: 18, color: "var(--text-secondary)", fontWeight: 400,
            letterSpacing: "-0.01em"
          }}>{t.titleSub}</div>
          <p style={{
            maxWidth: 720, fontSize: 14.5, lineHeight: 1.7,
            color: "var(--text-secondary)", margin: "6px 0 0"
          }}>{t.lede}</p>
        </header>

        <section style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12
        }}>
          {t.pillars.map((p) => (
            <div key={p.label} style={{
              padding: "14px 16px", borderRadius: 14,
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(15,23,42,0.06)",
              backdropFilter: "saturate(150%) blur(14px)",
              boxShadow: "0 2px 12px rgba(15,23,42,0.04)"
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 6
              }}>{p.label}</div>
              <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.55 }}>
                {p.desc}
              </div>
            </div>
          ))}
        </section>

        <section style={{
          display: "grid", gap: 10,
          padding: "18px 20px", borderRadius: 14,
          background: "rgba(255,255,255,0.55)",
          border: "1px dashed rgba(15,23,42,0.1)"
        }}>
          {t.how.map((line, i) => (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>
              {line}
            </div>
          ))}
        </section>

        {needsLogin && !authLoading && (
          <section style={{
            display: "grid", gap: 12,
            padding: "20px 22px", borderRadius: 16,
            background: "rgba(255,255,255,0.78)",
            border: "1px solid rgba(15,23,42,0.08)",
            backdropFilter: "saturate(160%) blur(16px)",
            boxShadow: "0 8px 28px rgba(15,23,42,0.06)",
            maxWidth: 460
          }}>
            <div>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
                textTransform: "uppercase", color: "var(--text-tertiary)"
              }}>{t.auth.title}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.55 }}>
                {t.auth.lede}
              </div>
            </div>
            <form onSubmit={handleSignIn} style={{ display: "grid", gap: 10 }}>
              <input
                type="email"
                required
                autoComplete="username"
                placeholder={t.auth.email}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  padding: "11px 14px", borderRadius: 10, fontSize: 14,
                  border: "1px solid rgba(15,23,42,0.12)",
                  background: "rgba(255,255,255,0.85)", outline: "none"
                }}
              />
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder={t.auth.password}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  padding: "11px 14px", borderRadius: 10, fontSize: 14,
                  border: "1px solid rgba(15,23,42,0.12)",
                  background: "rgba(255,255,255,0.85)", outline: "none"
                }}
              />
              {authError && (
                <div style={{
                  fontSize: 12, color: "#c44a3c", padding: "8px 12px",
                  background: "rgba(229,105,91,0.10)", borderRadius: 8
                }}>{authError}</div>
              )}
              <button
                type="submit"
                disabled={submitting || !email || !password}
                style={{
                  padding: "12px 18px", borderRadius: 10,
                  fontSize: 14, fontWeight: 600,
                  color: "#fff", border: "none",
                  cursor: submitting ? "progress" : "pointer",
                  background: "linear-gradient(135deg, #5b8def 0%, #8b6fd9 100%)",
                  opacity: submitting || !email || !password ? 0.6 : 1
                }}
              >{submitting ? t.auth.submitting : t.auth.submit}</button>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>
                {t.auth.noAccount}
              </div>
            </form>
          </section>
        )}

        <footer style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 4, flexWrap: "wrap" }}>
          {!authRequired && (
            <button
              onClick={onEnter}
              disabled={!canEnter}
              style={{
                padding: "14px 28px", borderRadius: 999,
                fontSize: 14, fontWeight: 700, letterSpacing: "0.01em",
                color: "#fff", border: "none", cursor: canEnter ? "pointer" : "not-allowed",
                background: "linear-gradient(135deg, #5b8def 0%, #8b6fd9 60%, #e5695b 100%)",
                boxShadow: "0 8px 28px rgba(91,141,239,0.35), 0 2px 6px rgba(15,23,42,0.06)",
                opacity: canEnter ? 1 : 0.45,
                transition: "transform 120ms ease, box-shadow 120ms ease"
              }}
              onMouseEnter={(e) => { if (canEnter) (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
            >
              {!stats ? t.loading : t.cta + " →"}
            </button>
          )}
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
            <div style={{ fontFamily: "var(--font-mono)" }}>
              {stats ? t.statsLabel(stats.nodes, stats.edges, stats.paths) : "—"}
            </div>
            <div style={{ marginTop: 2 }}>{t.subCta}</div>
          </div>
        </footer>
      </div>
    </div>
  );
}
