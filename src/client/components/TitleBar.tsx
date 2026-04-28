import type { Domain } from "./GraphCanvas";

export type Lang = "ko" | "en";

interface Props {
  subtitle: string;
  domainFilter: "all" | Domain;
  onDomainChange: (d: "all" | Domain) => void;
  bridgesOnly: boolean;
  onBridgesOnlyChange: (v: boolean) => void;
  lang: Lang;
  onLangChange: (l: Lang) => void;
  onHome?: () => void;
  onTutorial?: () => void;
  userEmail?: string | null;
  onSignOut?: () => void;
}

const OPTIONS: Array<{ key: "all" | Domain; label: string }> = [
  { key: "all", label: "All" },
  { key: "counseling", label: "Counseling" },
  { key: "clinical", label: "Clinical" }
];

export function TitleBar({ subtitle, domainFilter, onDomainChange, bridgesOnly, onBridgesOnlyChange, lang, onLangChange, onHome, onTutorial, userEmail, onSignOut }: Props) {
  return (
    <div className="titlebar" style={{ gridTemplateColumns: "120px 1fr auto", gap: 16 }}>
      <div className="window-chrome">
        <span className="traffic red" />
        <span className="traffic yellow" />
        <span className="traffic green" />
      </div>
      <div className="title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {onHome && (
          <button
            className="segment"
            onClick={onHome}
            title={lang === "ko" ? "랜딩으로 돌아가기" : "Back to landing"}
            style={{ padding: "2px 8px", fontSize: 12, lineHeight: 1.4 }}
          >← {lang === "ko" ? "홈" : "Home"}</button>
        )}
        <div>
          Counseling / Clinical Knowledge Graph
          <div style={{ fontSize: 11, fontWeight: 400, color: "var(--text-tertiary)", marginTop: 1 }}>
            {subtitle}
          </div>
        </div>
      </div>
      <div className="right" style={{ gap: 8 }}>
        {onTutorial && (
          <button
            className="segment"
            onClick={onTutorial}
            title={lang === "ko" ? "앱 안에서 5단계 안내 (스포트라이트)" : "5-step in-app walkthrough (spotlight)"}
            style={{ fontWeight: 600 }}
          >🎯 {lang === "ko" ? "튜토리얼" : "Tutorial"}</button>
        )}
        <a
          className="segment"
          href={`${import.meta.env.BASE_URL}guide/index.html`}
          target="_blank"
          rel="noopener noreferrer"
          title={lang === "ko" ? "CSCL 사용 가이드북 (새 탭)" : "CSCL guidebook (new tab)"}
          style={{ textDecoration: "none", fontWeight: 600, display: "inline-flex", alignItems: "center" }}
        >📘 {lang === "ko" ? "가이드" : "Guide"}</a>
        <button
          className={`segment ${bridgesOnly ? "active" : ""}`}
          onClick={() => onBridgesOnlyChange(!bridgesOnly)}
          title={lang === "ko" ? "§3-1 상담↔임상 브릿지만 강조" : "§3-1 — highlight counseling↔clinical bridges only"}
          style={{ color: bridgesOnly ? "var(--shared)" : undefined, fontWeight: 600 }}
          data-tutorial="bridges-toggle"
        >
          ⟷ Bridges
        </button>
        <div className="segmented" role="group" aria-label="language">
          <button
            className={`segment ${lang === "ko" ? "active" : ""}`}
            onClick={() => onLangChange("ko")}
            title={lang === "ko" ? "한국어 라벨" : "Korean labels"}
          >한</button>
          <button
            className={`segment ${lang === "en" ? "active" : ""}`}
            onClick={() => onLangChange("en")}
            title="English labels"
          >EN</button>
        </div>
        <div className="segmented">
          {OPTIONS.map((o) => (
            <button
              key={o.key}
              className={`segment ${domainFilter === o.key ? "active" : ""}`}
              onClick={() => onDomainChange(o.key)}
            >{o.label}</button>
          ))}
        </div>
        {userEmail && onSignOut && (
          <button
            className="segment"
            onClick={onSignOut}
            title={userEmail}
            style={{ fontSize: 11, color: "var(--text-tertiary)" }}
          >{lang === "ko" ? "로그아웃" : "Sign out"}</button>
        )}
      </div>
    </div>
  );
}
