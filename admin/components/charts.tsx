"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
type PerformancePoint = {
  label: string;
  answered: number;
  unanswered: number;
};

function niceCeil(n: number): number {
  if (n <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(n));
  const norm = n / mag;
  const nice = norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

export function ChartHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-tina-text">{title}</h2>
          {subtitle ? <p className="text-sm text-tina-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function IconWell({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: "green" | "purple" | "blue" | "amber";
}) {
  const tones = {
    green: "bg-[var(--tina-icon-green-bg,#ecfbdd)] text-[var(--tina-chart-green,#2b725b)]",
    purple: "bg-[var(--tina-icon-purple-bg,#eee8ff)] text-[var(--tina-chart-purple,#9170ff)]",
    blue: "bg-[var(--tina-icon-blue-bg,#e7efff)] text-[var(--tina-chart-blue,#6096f8)]",
    amber: "bg-[var(--tina-icon-amber-bg,#fff3dd)] text-[#8a6500]",
  } as const;
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
      {children}
    </span>
  );
}

const CHART_GREEN = "#2b725b";
const CHART_NEUTRAL = "#c9ced8";

export function PerformanceChart({
  points,
  rangeLabel,
}: {
  points: PerformancePoint[];
  rangeLabel?: string;
}) {
  const width = 640;
  const height = 148;
  const pad = { top: 6, right: 4, bottom: 26, left: 28 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const totals = points.map((p) => p.answered + p.unanswered);
  const maxQ = Math.max(1, ...totals);
  const niceMax = niceCeil(maxQ);
  const n = Math.max(1, points.length);
  const slot = plotW / n;
  // Fill most of each slot so bars span the widget; leave a small gutter.
  const barW = Math.max(10, Math.min(slot * 0.62, slot - 6));
  const yBar = (v: number) => pad.top + plotH - (v / niceMax) * plotH;

  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const tooltip = useMemo(() => {
    if (hover == null || !points[hover]) return null;
    const p = points[hover];
    const total = p.answered + p.unanswered;
    return {
      x: pad.left + slot * hover + slot / 2,
      label: p.label,
      answered: p.answered,
      unanswered: p.unanswered,
      total,
    };
  }, [hover, points, slot]);

  function onMove(clientX: number) {
    const el = wrapRef.current;
    if (!el || points.length === 0) return;
    const rect = el.getBoundingClientRect();
    const rel = ((clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const cx = pad.left + slot * i + slot / 2;
      const d = Math.abs(cx - rel);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHover(best);
  }

  const tickCount = 4;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round((niceMax / tickCount) * i),
  );

  const legend = (
    <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-tina-secondary">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_GREEN }} />
        Answered by Tina
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_NEUTRAL }} />
        Unanswered
      </span>
    </div>
  );

  return (
    <div className="flex w-full flex-col">
      <ChartHeader
        title="Tina performance over time"
        action={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="hidden sm:block">{legend}</div>
            {rangeLabel ? (
              <span className="inline-flex items-center gap-1 rounded-xl border border-tina-border bg-white px-2.5 py-1 text-xs font-semibold text-tina-muted">
                {rangeLabel}
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </span>
            ) : null}
          </div>
        }
      />
      <div className="mb-2 sm:hidden">{legend}</div>
      <div
        ref={wrapRef}
        className="relative w-full"
        style={{ aspectRatio: `${width} / ${height}` }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => onMove(e.clientX)}
        role="img"
        aria-label="Stacked bar chart of questions answered by Tina versus unanswered over time"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="absolute inset-0 block h-full w-full"
          preserveAspectRatio="none"
        >
          {yTicks.map((t) => {
            const y = yBar(t);
            return (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y}
                  y2={y}
                  stroke="#e9ecf3"
                  strokeDasharray="2 4"
                />
                <text
                  x={pad.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-[var(--tina-text-muted,#7b839f)] text-[10px]"
                >
                  {t}
                </text>
              </g>
            );
          })}

          {points.map((p, i) => {
            const cx = pad.left + slot * i + slot / 2;
            const bx = cx - barW / 2;
            const total = p.answered + p.unanswered;
            const topY = yBar(total);
            const midY = yBar(p.answered);
            const answeredH = Math.max(0, pad.top + plotH - midY);
            const unansweredH = Math.max(0, midY - topY);
            const dimmed = hover != null && hover !== i;
            const radius = Math.min(5, barW / 2);
            return (
              <g key={`bar-${p.label}-${i}`} opacity={dimmed ? 0.45 : 1}>
                {p.answered > 0 ? (
                  <rect
                    x={bx}
                    y={midY}
                    width={barW}
                    height={answeredH}
                    fill={CHART_GREEN}
                    rx={p.unanswered === 0 ? radius : 0}
                  />
                ) : null}
                {p.unanswered > 0 ? (
                  unansweredH < radius * 2 ? (
                    <rect
                      x={bx}
                      y={topY}
                      width={barW}
                      height={unansweredH}
                      fill={CHART_NEUTRAL}
                      rx={radius}
                    />
                  ) : (
                    <path
                      d={[
                        `M ${bx} ${midY}`,
                        `L ${bx} ${topY + radius}`,
                        `Q ${bx} ${topY} ${bx + radius} ${topY}`,
                        `L ${bx + barW - radius} ${topY}`,
                        `Q ${bx + barW} ${topY} ${bx + barW} ${topY + radius}`,
                        `L ${bx + barW} ${midY}`,
                        "Z",
                      ].join(" ")}
                      fill={CHART_NEUTRAL}
                    />
                  )
                ) : null}
                <rect
                  x={bx}
                  y={Math.min(topY, midY)}
                  width={barW}
                  height={Math.max(1, answeredH + unansweredH)}
                  fill="transparent"
                  className="cursor-pointer"
                  onFocus={() => setHover(i)}
                  tabIndex={0}
                  aria-label={`${p.label}: ${p.answered} answered, ${p.unanswered} unanswered`}
                />
              </g>
            );
          })}

          {points.map((p, i) => {
            const step = points.length > 10 ? Math.ceil(points.length / 7) : 1;
            if (i % step !== 0 && i !== points.length - 1) return null;
            const cx = pad.left + slot * i + slot / 2;
            return (
              <text
                key={`lbl-${p.label}-${i}`}
                x={cx}
                y={height - 8}
                textAnchor="middle"
                className="fill-[var(--tina-text-secondary,#565c73)] text-[10px]"
              >
                {p.label}
              </text>
            );
          })}
        </svg>

        {tooltip ? (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-xl border border-tina-border bg-white px-3 py-2 text-xs font-medium text-tina-text shadow-soft"
            style={{
              left: `${(tooltip.x / width) * 100}%`,
              top: "4%",
            }}
          >
            <p className="text-[11px] text-tina-muted">{tooltip.label}</p>
            <p className="font-semibold">{tooltip.answered} answered by Tina</p>
            <p className="text-tina-muted">{tooltip.unanswered} unanswered</p>
            <p className="mt-0.5 text-tina-secondary">{tooltip.total} total</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function donutArc(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
): string {
  const polar = (r: number, a: number) => ({
    x: cx + r * Math.cos(a),
    y: cy + r * Math.sin(a),
  });
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  const o0 = polar(rOuter, startAngle);
  const o1 = polar(rOuter, endAngle);
  const i1 = polar(rInner, endAngle);
  const i0 = polar(rInner, startAngle);
  return [
    `M ${o0.x.toFixed(2)} ${o0.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `L ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i0.x.toFixed(2)} ${i0.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

export function OutcomeDonut({
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
    { label: "Answered from knowledge", value: success, color: CHART_GREEN },
    { label: "Needs attention", value: gaps, color: "#ffc75e" },
    { label: "Human replies", value: human, color: "#9170ff" },
    { label: "System error", value: errors, color: "#d71938" },
  ];
  const rawTotal = parts.reduce((s, p) => s + p.value, 0);
  const total = rawTotal || 1;
  const [hover, setHover] = useState<string | null>(null);

  const segments = parts.map((part) => ({
    ...part,
    pct: rawTotal === 0 ? 0 : Math.round((part.value / total) * 100),
  }));
  const visible = segments.filter((s) => s.value > 0);

  const size = 156;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 70;
  const rInner = 48;
  let angle = -Math.PI / 2;
  const arcs = visible.map((part) => {
    const sweep = (part.value / total) * Math.PI * 2;
    const start = angle;
    const end = angle + Math.max(sweep, 0.001);
    angle = end;
    return { ...part, d: donutArc(cx, cy, rOuter, rInner, start, end - 0.002) };
  });

  return (
    <div className="flex min-w-0 flex-col">
      <ChartHeader title="Answer outcomes" />
      <div className="flex min-w-0 items-center gap-5">
        <div
          className="relative shrink-0"
          role="img"
          aria-label={`Answer outcomes donut: ${rawTotal} questions`}
        >
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {rawTotal === 0 ? (
              <circle
                cx={cx}
                cy={cy}
                r={(rOuter + rInner) / 2}
                fill="none"
                stroke="#e9ecf3"
                strokeWidth={rOuter - rInner}
              />
            ) : (
              arcs.map((arc) => (
                <path
                  key={arc.label}
                  d={arc.d}
                  fill={arc.color}
                  opacity={hover == null || hover === arc.label ? 1 : 0.4}
                  className="cursor-pointer transition-opacity"
                  onMouseEnter={() => setHover(arc.label)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(arc.label)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  aria-label={`${arc.label}: ${arc.value} (${arc.pct}%)`}
                />
              ))
            )}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-[28px] font-semibold leading-none tracking-tight text-tina-text">
              {rawTotal}
            </p>
            <p className="mt-1 text-xs text-tina-muted">questions</p>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-2 text-sm">
          {segments.map((part) => (
            <li
              key={part.label}
              className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 rounded-lg px-1 py-0.5 transition ${
                hover === part.label ? "bg-tina-subtle" : ""
              }`}
              onMouseEnter={() => setHover(part.label)}
              onMouseLeave={() => setHover(null)}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: part.color }}
              />
              <span className="truncate text-tina-secondary">{part.label}</span>
              <span className="tabular-nums font-semibold text-tina-text">{part.value}</span>
              <span className="w-10 text-right tabular-nums text-tina-muted">{part.pct}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
