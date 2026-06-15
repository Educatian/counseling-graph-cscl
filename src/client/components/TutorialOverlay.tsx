import { useEffect, useRef, useState } from "react";
import { logEvent } from "../lib/eventLogger";
import type { Lang } from "./TitleBar";

export interface TutorialStep {
  id: string;
  /**
   * CSS selector for the UI element to spotlight. If null (or the element is
   * not currently in the DOM, e.g. NodeDetailPanel before any node is opened),
   * the popover renders centered with a "this UI isn't visible yet" hint.
   */
  targetSelector: string | null;
  shape?: "circle" | "rect";
  pad?: number;
  /**
   * When true, spotlight every element matching `targetSelector` (e.g. both
   * entry hubs). Popover is positioned against the union bounding box.
   */
  multi?: boolean;
  title: { ko: string; en: string };
  body:  { ko: string; en: string };
  /**
   * Optional screencast base name (e.g. "discovery"). Resolves to
   * `${BASE_URL}guide/videos/<video>.mp4` (+ .jpg poster) — a narrated clip of
   * the step's interaction, embedded in the popover.
   */
  video?: string;
}

interface Props {
  open: boolean;
  steps: TutorialStep[];
  step: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  lang: Lang;
}

const POP_W = 384;
const POP_H_EST = 430;

const STR = {
  ko: {
    title: "튜토리얼",
    prev: "이전",
    next: "다음",
    skip: "건너뛰기",
    done: "끝내기",
    progress: (i: number, n: number) => `${i} / ${n}단계`,
    noTarget: "이 단계의 UI가 아직 화면에 없습니다. 설명만 읽고 다음으로 넘어가셔도 됩니다.",
    soundHint: "🔊 소리를 켜면 한국어 설명이 나와요"
  },
  en: {
    title: "Tutorial",
    prev: "Prev",
    next: "Next",
    skip: "Skip",
    done: "Done",
    progress: (i: number, n: number) => `Step ${i} of ${n}`,
    noTarget: "This step's UI isn't on screen yet — read the description and continue.",
    soundHint: "🔊 Unmute for the Korean voice-over"
  }
} as const;

function rectsEqual(a: DOMRect[], b: DOMRect[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (Math.abs(x.left - y.left) >= 0.5 || Math.abs(x.top - y.top) >= 0.5
        || Math.abs(x.width - y.width) >= 0.5 || Math.abs(x.height - y.height) >= 0.5) {
      return false;
    }
  }
  return true;
}

function unionRect(rects: DOMRect[]): DOMRect | null {
  if (rects.length === 0) return null;
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const x of rects) {
    if (x.width <= 0 || x.height <= 0) continue;
    l = Math.min(l, x.left); t = Math.min(t, x.top);
    r = Math.max(r, x.right); b = Math.max(b, x.bottom);
  }
  if (!isFinite(l)) return null;
  return new DOMRect(l, t, r - l, b - t);
}

export function TutorialOverlay({ open, steps, step, onPrev, onNext, onClose, lang }: Props) {
  const t = STR[lang];
  const current: TutorialStep | undefined = steps[step];
  const [rects, setRects] = useState<DOMRect[]>([]);
  const [vp, setVp] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1280,
    h: typeof window !== "undefined" ? window.innerHeight : 800
  }));
  const rafRef = useRef<number | null>(null);

  // Track target rects every animation frame so the spotlight follows D3 sim
  // ticks, scrolls, and layout shifts without wiring component-specific channels.
  // Supports `multi`: querySelectorAll → all matches share one cutout group.
  useEffect(() => {
    if (!open || !current) { setRects([]); return; }
    const tick = () => {
      const sel = current.targetSelector;
      if (!sel) { setRects((prev) => (prev.length === 0 ? prev : [])); rafRef.current = requestAnimationFrame(tick); return; }
      const els = current.multi
        ? Array.from(document.querySelectorAll(sel))
        : [document.querySelector(sel)].filter(Boolean) as Element[];
      const next: DOMRect[] = [];
      for (const el of els) {
        const r = (el as Element).getBoundingClientRect();
        if (r.width > 0 && r.height > 0) next.push(r);
      }
      setRects((prev) => (rectsEqual(prev, next) ? prev : next));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [open, current]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  // Log every step transition for downstream UX/path-signature analysis.
  useEffect(() => {
    if (!open || !current) return;
    void logEvent("tutorial_step", { step, id: current.id });
  }, [open, step, current]);

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); onNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); onPrev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onNext, onPrev, onClose]);

  if (!open || !current) return null;

  const isLast = step >= steps.length - 1;
  const isFirst = step <= 0;

  // Spotlight geometry — one cutout entry per matched rect (≥1 when multi).
  const pad = current.pad ?? 8;
  const shape = current.shape ?? "rect";
  type Cutout = { x: number; y: number; w: number; h: number; cx: number; cy: number; rad: number };
  const cutouts: Cutout[] = rects.map((r) => {
    const x = r.left - pad;
    const y = r.top - pad;
    const w = r.width + pad * 2;
    const h = r.height + pad * 2;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, rad: Math.max(w, h) / 2 + 4 };
  });

  // Popover placement: anchor on the union of all rects (so multi-spotlight
  // and single-spotlight share one code path).
  const unionR = unionRect(rects);
  let popX = (vp.w - POP_W) / 2;
  let popY = (vp.h - POP_H_EST) / 2;
  if (unionR) {
    const margin = 16;
    const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
    const fitsBelow = vp.h - unionR.bottom - margin >= POP_H_EST;
    const fitsAbove = unionR.top - margin >= POP_H_EST;
    const fitsRight = vp.w - unionR.right - margin >= POP_W;
    const fitsLeft = unionR.left - margin >= POP_W;
    if (fitsBelow) {
      popY = unionR.bottom + margin;
      popX = clamp(unionR.left + unionR.width / 2 - POP_W / 2, 12, vp.w - POP_W - 12);
    } else if (fitsAbove) {
      popY = unionR.top - POP_H_EST - margin;
      popX = clamp(unionR.left + unionR.width / 2 - POP_W / 2, 12, vp.w - POP_W - 12);
    } else if (fitsRight) {
      popX = unionR.right + margin;
      popY = clamp(unionR.top + unionR.height / 2 - POP_H_EST / 2, 12, vp.h - POP_H_EST - 12);
    } else if (fitsLeft) {
      popX = unionR.left - POP_W - margin;
      popY = clamp(unionR.top + unionR.height / 2 - POP_H_EST / 2, 12, vp.h - POP_H_EST - 12);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999 }}>
      <svg
        width={vp.w}
        height={vp.h}
        style={{ position: "absolute", inset: 0, pointerEvents: "auto" }}
        // Click on the dim layer = no-op (spotlight clicks pass through the cutout
        // because pointer-events of the SVG <rect> sits below; cutout area is alpha 0).
      >
        <defs>
          <mask id="tutorial-mask" maskUnits="userSpaceOnUse">
            <rect x={0} y={0} width={vp.w} height={vp.h} fill="white" />
            {cutouts.map((c, i) => (
              shape === "circle"
                ? <circle key={i} cx={c.cx} cy={c.cy} r={c.rad} fill="black" />
                : <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} rx={10} ry={10} fill="black" />
            ))}
          </mask>
        </defs>
        <rect
          x={0} y={0} width={vp.w} height={vp.h}
          fill="rgba(15,23,42,0.55)"
          mask="url(#tutorial-mask)"
        />
        <g style={{ pointerEvents: "none" }}>
          {cutouts.map((c, i) => (
            shape === "circle"
              ? <circle
                  key={i}
                  cx={c.cx} cy={c.cy} r={c.rad}
                  fill="none"
                  stroke="rgba(91,141,239,0.95)"
                  strokeWidth={2}
                  style={{ filter: "drop-shadow(0 0 12px rgba(91,141,239,0.7))" }}
                />
              : <rect
                  key={i}
                  x={c.x} y={c.y}
                  width={c.w} height={c.h}
                  rx={10} ry={10}
                  fill="none"
                  stroke="rgba(91,141,239,0.95)"
                  strokeWidth={2}
                  style={{ filter: "drop-shadow(0 0 12px rgba(91,141,239,0.7))" }}
                />
          ))}
        </g>
      </svg>

      <div
        role="dialog"
        aria-label={t.title}
        style={{
          position: "absolute", left: popX, top: popY, width: POP_W,
          background: "rgba(255,255,255,0.97)",
          border: "1px solid rgba(15,23,42,0.1)",
          borderRadius: 14,
          padding: "16px 18px",
          boxShadow: "0 24px 60px rgba(15,23,42,0.18), 0 4px 14px rgba(15,23,42,0.08)",
          backdropFilter: "saturate(160%) blur(14px)",
          color: "var(--text-primary)",
          fontSize: 13, lineHeight: 1.55,
          pointerEvents: "auto",
          transition: "left 220ms cubic-bezier(0.2,0.8,0.2,1), top 220ms cubic-bezier(0.2,0.8,0.2,1)"
        }}
      >
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
          textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 8
        }}>
          <span>🎯 {t.title}</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>{t.progress(step + 1, steps.length)}</span>
        </div>
        <div style={{
          fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600,
          letterSpacing: "-0.01em", marginBottom: 6, color: "var(--text-primary)"
        }}>
          {current.title[lang]}
        </div>
        {current.video ? (
          <div style={{ marginBottom: 10 }}>
            <video
              key={current.video}
              src={`${import.meta.env.BASE_URL}guide/videos/${current.video}.mp4`}
              poster={`${import.meta.env.BASE_URL}guide/videos/${current.video}.jpg`}
              controls
              autoPlay
              muted
              playsInline
              preload="metadata"
              style={{
                width: "100%", display: "block", borderRadius: 10,
                border: "1px solid rgba(15,23,42,0.08)", background: "#0f1729"
              }}
            />
            <div style={{
              fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 5, textAlign: "center"
            }}>{t.soundHint}</div>
          </div>
        ) : null}
        <div style={{ color: "var(--text-secondary)", marginBottom: 12 }}>
          {current.body[lang]}
        </div>
        {rects.length === 0 && current.targetSelector ? (
          <div style={{
            fontSize: 11, color: "var(--text-tertiary)",
            padding: "6px 8px", borderRadius: 6,
            background: "rgba(15,23,42,0.04)", marginBottom: 10
          }}>
            {t.noTarget}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            className="segment"
            onClick={onClose}
            style={{ fontSize: 11, color: "var(--text-tertiary)" }}
          >{t.skip}</button>
          <div style={{ flex: 1 }} />
          <button
            className="segment"
            onClick={onPrev}
            disabled={isFirst}
            style={{ fontSize: 12, opacity: isFirst ? 0.4 : 1 }}
          >◀ {t.prev}</button>
          <button
            onClick={isLast ? onClose : onNext}
            style={{
              fontSize: 12, fontWeight: 700, color: "#fff",
              padding: "6px 14px", borderRadius: 8,
              background: "linear-gradient(135deg,#5b8def,#8b6fd9)",
              border: "1px solid transparent",
              boxShadow: "0 4px 14px rgba(91,141,239,0.35)"
            }}
          >{isLast ? t.done : `${t.next} ▶`}</button>
        </div>
      </div>
    </div>
  );
}
