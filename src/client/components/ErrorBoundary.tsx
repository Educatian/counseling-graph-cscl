import { Component, type ReactNode } from "react";
import { logEvent } from "../lib/eventLogger";

interface Props { children: ReactNode; lang?: "ko" | "en" }
interface State { error: Error | null }

/**
 * Last-resort UI guard. A render crash inside the graph view should degrade to
 * a calm, branded recovery card — not a white screen — and leave a trace event.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    void logEvent("ui_error", { message: error.message, stack: (error.stack || "").slice(0, 400) });
  }

  render() {
    const { error } = this.state;
    const ko = (this.props.lang ?? "ko") === "ko";
    if (!error) return this.props.children;
    return (
      <div style={{
        position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24
      }}>
        <div style={{
          maxWidth: 420, textAlign: "center",
          padding: "26px 28px", borderRadius: 16,
          background: "var(--glass-strong)", border: "1px solid var(--border-hair)",
          boxShadow: "var(--shadow-lg)"
        }}>
          <div style={{ fontSize: 26, marginBottom: 8 }}>◍</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
            {ko ? "예상치 못한 문제가 발생했어요" : "Something went wrong"}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.6 }}>
            {ko
              ? "화면을 새로고침하면 대부분 해결됩니다. 계속되면 강의자에게 알려주세요."
              : "Reloading usually fixes this. If it persists, let your instructor know."}
          </div>
          <button className="primary" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>
            {ko ? "새로고침" : "Reload"}
          </button>
        </div>
      </div>
    );
  }
}
