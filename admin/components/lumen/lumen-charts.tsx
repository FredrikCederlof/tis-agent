"use client";

import { useMemo, useRef, useState } from "react";
import { formatSavedTime } from "@/lib/time-saved";

type PerformancePoint = {
  label: string;
  questions: number;
  answeredPct: number;
  attentionPct: number;
};

/** Fills resolve against the .lumen-ui wrapper, so both themes work unchanged. */
const INK = "var(--l-ink)";
const ACCENT = "var(--l-accent)";
const LINE = "var(--l-line)";
const SOFT = "var(--l-soft)";

function smoothPath(points: { x: number; y: number }[], yMin: number, yMax: number): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const clampY = (y: number) => Math.min(yMax, Math.max(yMin, y));
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clampY(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clampY(p2.y - (p3.y - p1.y) / 6);
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function LumenSparkline({
  values,
  labels,
  format = "number",
  tone = "ink",
}: {
  values: number[];
  labels?: string[];
  format?: "number" | "percent" | "duration";
  tone?: "ink" | "accent";
}) {
  const width = 120;
  const height = 48;
  const series = values.length > 0 ? values.slice(-12) : [0];
  const seriesLabels = labels ? labels.slice(-series.length) : [];
  const max = Math.max(1, ...series);
  const gap = 3;
  const barW = Math.max(4, (width - gap * (series.length - 1)) / series.length);
  const [hover, setHover] = useState<number | null>(null);
  const fill = tone === "accent" ? ACCENT : INK;

  const formatValue = useMemo(
    () => (v: number) => {
      if (format === "percent") return `${v}%`;
      if (format === "duration") return formatSavedTime(v);
      return String(v);
    },
    [format],
  );

  function onMove(clientX: number, target: SVGSVGElement) {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0) return;
    const rel = ((clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < series.length; i++) {
      const cx = i * (barW + gap) + barW / 2;
      const d = Math.abs(cx - rel);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHover(best);
  }

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: 104, height: 44, maxWidth: "100%" }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => onMove(e.clientX, e.currentTarget)}
        role="img"
        aria-label="Trend for the selected period"
      >
        {series.map((v, i) => {
          const h = Math.max(3, (v / max) * height);
          const x = i * (barW + gap);
          return (
            <rect
              key={i}
              x={x}
              y={height - h}
              width={barW}
              height={h}
              rx={Math.min(barW / 2, 2)}
              fill={fill}
              opacity={hover == null ? 0.85 : hover === i ? 1 : 0.3}
            />
          );
        })}
      </svg>
      {hover != null ? (
        <span
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translate(-50%, -6px)",
            padding: "5px 9px",
            borderRadius: 999,
            background: INK,
            color: "var(--l-canvas)",
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          {seriesLabels[hover] ? `${seriesLabels[hover]} · ` : ""}
          {formatValue(series[hover])}
        </span>
      ) : null}
    </div>
  );
}

export function LumenPerformanceChart({ points }: { points: PerformancePoint[] }) {
  const width = 520;
  const height = 260;
  const pad = { top: 12, right: 12, bottom: 30, left: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxQuestions = Math.max(1, ...points.map((p) => p.questions));

  const x = (i: number) =>
    pad.left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yPct = (v: number) => pad.top + plotH - (v / 100) * plotH;
  const yBar = (v: number) => pad.top + plotH - (v / maxQuestions) * plotH;
  const barW = Math.max(3, Math.min(10, (plotW / Math.max(1, points.length)) * 0.4));

  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  function onMove(clientX: number) {
    const el = wrapRef.current;
    if (!el || points.length === 0) return;
    const rect = el.getBoundingClientRect();
    const rel = ((clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(x(i) - rel);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHover(best);
  }

  const active = hover != null ? points[hover] : null;

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", flex: 1, minHeight: 0 }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => onMove(e.clientX)}
    >
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "100%" }}>
        {[0, 50, 100].map((t) => (
          <g key={t}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={yPct(t)}
              y2={yPct(t)}
              stroke={LINE}
            />
            <text
              x={pad.left - 8}
              y={yPct(t) + 3}
              textAnchor="end"
              fill="var(--l-muted)"
              fontSize="10"
            >
              {t}%
            </text>
          </g>
        ))}

        {points.map((p, i) => {
          const top = yBar(p.questions);
          return (
            <rect
              key={`bar-${i}`}
              x={x(i) - barW / 2}
              y={top}
              width={barW}
              height={Math.max(0, pad.top + plotH - top)}
              rx={barW / 2}
              fill={SOFT}
            />
          );
        })}

        <path
          d={smoothPath(
            points.map((p, i) => ({ x: x(i), y: yPct(p.answeredPct) })),
            pad.top,
            pad.top + plotH,
          )}
          fill="none"
          stroke={INK}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d={smoothPath(
            points.map((p, i) => ({ x: x(i), y: yPct(p.attentionPct) })),
            pad.top,
            pad.top + plotH,
          )}
          fill="none"
          stroke={ACCENT}
          strokeWidth="2.4"
          strokeLinecap="round"
        />

        {hover != null ? (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={pad.top}
            y2={pad.top + plotH}
            stroke={INK}
            strokeOpacity="0.25"
            strokeDasharray="4 4"
          />
        ) : null}

        {points.map((p, i) => {
          const step = points.length > 14 ? Math.ceil(points.length / 6) : 1;
          if (i % step !== 0 && i !== points.length - 1) return null;
          return (
            <text
              key={`lbl-${i}`}
              x={x(i)}
              y={height - 6}
              textAnchor="middle"
              fill="var(--l-muted)"
              fontSize="10"
            >
              {p.label}
            </text>
          );
        })}
      </svg>

      {active ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: `${(x(hover as number) / width) * 100}%`,
            transform: "translateX(-50%)",
            padding: "10px 14px",
            borderRadius: 16,
            border: `1px solid var(--l-line)`,
            background: "var(--l-raised)",
            fontSize: 13,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 5,
          }}
        >
          <p className="l-small l-muted">{active.label}</p>
          <p style={{ fontWeight: 600 }}>{active.answeredPct}% answered</p>
          <p className="l-small l-muted">{active.questions} questions</p>
        </div>
      ) : null}
    </div>
  );
}

export function LumenOutcomeBar({
  success,
  gaps,
  human,
  errors,
}: {
  success: number;
  gaps: number;
  human: number;
  errors: number;
}) {
  const parts = [
    { label: "Answered from knowledge", value: success, color: INK },
    { label: "Needs attention", value: gaps, color: ACCENT },
    { label: "Human replies", value: human, color: "var(--l-faint)" },
    { label: "System error", value: errors, color: "var(--l-danger)" },
  ];
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const [hover, setHover] = useState<string | null>(null);

  const segments = parts.map((part) => ({
    ...part,
    pct: total === 0 ? 0 : Math.round((part.value / total) * 100),
  }));
  const active = segments.find((s) => s.label === hover) ?? null;
  const visible = segments.filter((s) => s.value > 0);

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "column", gap: 24 }}>
      <div>
        <strong className="l-kpi-value">{active ? active.value : total}</strong>
        <p className="l-small l-muted" style={{ marginTop: 8 }}>
          {active ? `${active.pct}% · ${active.label.toLowerCase()}` : "questions in this period"}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          height: 14,
          borderRadius: 999,
          overflow: "hidden",
          background: SOFT,
        }}
        onMouseLeave={() => setHover(null)}
      >
        {visible.map((part) => (
          <button
            key={part.label}
            type="button"
            aria-label={`${part.label}: ${part.value} (${part.pct}%)`}
            style={{
              flexGrow: part.value,
              flexBasis: 0,
              minWidth: 0,
              height: "100%",
              border: 0,
              padding: 0,
              background: part.color,
              opacity: hover == null || hover === part.label ? 1 : 0.35,
            }}
            onMouseEnter={() => setHover(part.label)}
            onFocus={() => setHover(part.label)}
            onBlur={() => setHover(null)}
          />
        ))}
      </div>

      <ul className="l-list">
        {segments.map((part) => (
          <li
            key={part.label}
            style={{ justifyContent: "space-between", alignItems: "center" }}
            onMouseEnter={() => setHover(part.label)}
            onMouseLeave={() => setHover(null)}
          >
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}
              className="l-muted"
            >
              <span className="l-key" style={{ background: part.color, flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {part.label}
              </span>
            </span>
            <span style={{ fontWeight: 600, flexShrink: 0 }}>
              {part.value}
              <span className="l-muted l-small" style={{ marginLeft: 6 }}>
                ({part.pct}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
