import type { Domain } from "./GraphCanvas";

interface Props {
  stats: Record<string, number> | null;
  paths: Array<{ id: string; title: string; nodeSequence: string[] }>;
  domainFilter: "all" | Domain;
  onDomainChange: (d: "all" | Domain) => void;
  activePathId: string | null;
  onPathSelect: (id: string | null, seq: string[] | null) => void;
  recording: boolean;
  onToggleRecording: () => void;
  myPath: string[];
  onClearMyPath: () => void;
  nodeLookup: Map<string, string>;
}

const DOMAIN_DOT: Record<string, string> = {
  counseling: "var(--counseling)",
  clinical: "var(--clinical)",
  shared: "var(--shared)"
};

const DOMAIN_LABEL: Record<"all" | Domain, string> = {
  all: "전체 그래프",
  counseling: "상담심리",
  clinical: "임상심리",
  shared: "공통 허브"
};

export function Sidebar({ stats, paths, domainFilter, onDomainChange, activePathId, onPathSelect, recording, onToggleRecording, myPath, onClearMyPath, nodeLookup }: Props) {
  const items: Array<"all" | Domain> = ["all", "counseling", "clinical", "shared"];
  return (
    <aside className="sidebar">
      <div className="sidebar-section-label">Domains</div>
      {items.map((d) => (
        <div
          key={d}
          className={`sidebar-item ${domainFilter === d ? "active" : ""}`}
          onClick={() => onDomainChange(d)}
        >
          <span className="dot" style={{ background: d === "all" ? "linear-gradient(135deg,var(--counseling),var(--clinical))" : DOMAIN_DOT[d] }} />
          <span style={{ flex: 1 }}>{DOMAIN_LABEL[d]}</span>
          {stats && d !== "all" ? (
            <span className="count">{stats[d] ?? 0}</span>
          ) : null}
        </div>
      ))}

      <div className="sidebar-section-label" style={{ marginTop: 6 }}>Seed learning paths</div>
      <div style={{ overflow: "auto", flex: 1 }}>
        {paths.map((p) => {
          const active = activePathId === p.id;
          return (
            <div
              key={p.id}
              className={`sidebar-item${active ? " active" : ""}`}
              onClick={() => onPathSelect(active ? null : p.id, active ? null : p.nodeSequence)}
              title={p.title}
              style={{ fontSize: 12, lineHeight: 1.35 }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: 2, flex: "none",
                background: active ? "var(--accent)" : "rgba(15,23,42,0.14)"
              }} />
              <span style={{
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1
              }}>{p.title}</span>
              {active ? <span style={{ fontSize: 10, color: "var(--accent)" }}>● 재생중</span> : null}
            </div>
          );
        })}
        {paths.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "4px 10px" }}>—</div>
        ) : null}
      </div>

      <div className="sidebar-section-label" style={{ marginTop: 6 }}>My path (record)</div>
      <div style={{ padding: "2px 12px 10px", display: "grid", gap: 6 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className={`segment ${recording ? "active" : ""}`}
            onClick={onToggleRecording}
            style={{ flex: 1, color: recording ? "#b91c1c" : undefined, fontWeight: 600, fontSize: 11 }}
          >{recording ? "● REC · 클릭하여 경로 추가" : "⏺ 내 경로 기록"}</button>
          {myPath.length > 0 ? (
            <button className="segment" onClick={onClearMyPath} style={{ fontSize: 11 }}>Clear</button>
          ) : null}
        </div>
        {myPath.length > 0 ? (
          <div style={{
            fontSize: 11, lineHeight: 1.5, color: "var(--text-secondary)",
            padding: "6px 8px", borderRadius: 6,
            border: "1px dashed #10b981", background: "rgba(16,185,129,0.06)"
          }}>
            {myPath.map((id, i) => (
              <span key={i}>
                {i > 0 ? <span style={{ color: "#10b981", margin: "0 4px" }}>→</span> : null}
                <span>{nodeLookup.get(id) ?? id}</span>
              </span>
            ))}
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4 }}>
              {myPath.length} step{myPath.length > 1 ? "s" : ""}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", padding: "0 2px" }}>
            REC 켜고 그래프에서 노드를 순서대로 클릭하세요
          </div>
        )}
      </div>

      <div className="sidebar-section-label">Legend</div>
      <div style={{ padding: "2px 12px 10px", display: "grid", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
        <LegendRow color="var(--counseling)" label="상담 — 쿨 블루" />
        <LegendRow color="var(--clinical)"   label="임상 — 코랄" />
        <LegendRow color="var(--shared)"     label="공통 허브 — 바이올렛" />
        <LegendRow ring label="● 시작점 (§1-2/§2-2)" />
        <LegendRow keyHub label="◉ 중요 허브 (§1-2/§2-2)" />
        <LegendRow dashed label="⤳ 브릿지 (§3-1)" />
      </div>

      <div style={{
        marginTop: "auto", padding: "10px 10px 6px", borderTop: "1px solid var(--border-hair)",
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <span className="status-pill">Phase 0 · local</span>
        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>v0.0.1</span>
      </div>
    </aside>
  );
}

function LegendRow(props: { color?: string; label: string; ring?: boolean; keyHub?: boolean; dashed?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {props.dashed ? (
        <span style={{
          width: 18, height: 2, borderTop: "1.5px dashed var(--shared)", flex: "none"
        }} />
      ) : props.ring ? (
        <span style={{
          width: 10, height: 10, borderRadius: 50, flex: "none",
          background: "var(--counseling)",
          boxShadow: "0 0 0 2px rgba(91,141,239,0.35), 0 0 0 4px rgba(91,141,239,0.15)"
        }} />
      ) : props.keyHub ? (
        <span style={{
          width: 10, height: 10, borderRadius: 50, flex: "none",
          background: "var(--counseling)",
          border: "1.5px solid rgba(15,23,42,0.45)"
        }} />
      ) : (
        <span style={{ width: 10, height: 10, borderRadius: 50, flex: "none", background: props.color }} />
      )}
      <span>{props.label}</span>
    </div>
  );
}
