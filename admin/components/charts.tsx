"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, MessageCircle, Sparkles } from "lucide-react";

type PerformancePoint = {
  label: string;
  questions: number;
  answeredPct: number;
  attentionPct: number;
};

function niceCeil(n: number): number {
  if (n <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(n));
  const norm = n / mag;
  const nice = norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

function roundedLine(
  points: { x: number; y: number }[],
  yMin: number,
  yMax: number,
): string {
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

export function ChartHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {icon}
        <div>
          <h2 className="text-lg font-bold text-tis-navy">{title}</h2>
          <p className="text-sm text-tis-muted">{subtitle}</p>
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
    green: "bg-[#e7f3ec] text-tis-navy",
    purple: "bg-[#f3eeff] text-[#6b4fd8]",
    blue: "bg-[#eef1ff] text-tis-blue",
    amber: "bg-[#fff6e0] text-[#8a6500]",
  } as const;
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function PerformanceChart({
  points,
  rangeLabel,
}: {
  points: PerformancePoint[];
  rangeLabel?: string;
}) {
  const width = 520;
  const height = 280;
  const pad = { top: 10, right: 16, bottom: 32, left: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxQ = Math.max(1, ...points.map((p) => p.questions));
  const niceMax = niceCeil(maxQ);

  const x = (i: number) =>
    pad.left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yPct = (v: number) => pad.top + plotH - (v / 100) * plotH;
  const yBar = (v: number) => pad.top + plotH - (v / niceMax) * plotH;
  const barW = Math.max(3, Math.min(12, (plotW / Math.max(1, points.length)) * 0.42));
  const yMin = pad.top;
  const yMax = pad.top + plotH;

  const line = (key: "answeredPct" | "attentionPct") =>
    roundedLine(
      points.map((p, i) => ({ x: x(i), y: yPct(p[key]) })),
      yMin,
      yMax,
    );

  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const tooltip = useMemo(() => {
    if (hover == null || !points[hover]) return null;
    const p = points[hover];
    return {
      x: x(hover),
      label: p.label,
      answered: `${p.answeredPct}% answered`,
      questions: `${p.questions} questions`,
    };
  }, [hover, points]);

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

  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div className="flex h-full min-h-[260px] w-full flex-col">
      <ChartHeader
        icon={
          <IconWell>
            <MessageCircle className="h-4 w-4" strokeWidth={2.25} />
          </IconWell>
        }
        title="Tina performance over time"
        subtitle="Share of questions answered by Tina"
        action={
          rangeLabel ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-tis-muted">
              {rangeLabel}
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </span>
          ) : null
        }
      />
      <div className="mb-1 flex flex-wrap gap-4 text-xs font-medium text-tis-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-tis-navy" />
          Answered by Tina %
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-tis-amber" />
          Needs attention %
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[#cbbdff]" />
          Total questions
        </span>
      </div>
      <div
        ref={wrapRef}
        className="relative min-h-0 flex-1"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => onMove(e.clientX)}
      >
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
          {yTicks.map((t) => (
            <text
              key={t}
              x={pad.left - 8}
              y={yPct(t) + 3}
              textAnchor="end"
              className="fill-slate-400 text-[10px]"
            >
              {t}%
            </text>
          ))}

          {points.map((p, i) => {
            const bx = x(i) - barW / 2;
            const top = yBar(p.questions);
            const h = pad.top + plotH - top;
            return (
              <rect
                key={`bar-${p.label}-${i}`}
                x={bx}
                y={top}
                width={barW}
                height={Math.max(0, h)}
                fill="#ddd4ff"
                rx="3"
              />
            );
          })}

          <path
            d={line("answeredPct")}
            fill="none"
            stroke="#05513d"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={line("attentionPct")}
            fill="none"
            stroke="#ffc857"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((p, i) => (
            <g key={`dots-${p.label}-${i}`}>
              <circle cx={x(i)} cy={yPct(p.answeredPct)} r="3" fill="#05513d" />
              <circle cx={x(i)} cy={yPct(p.attentionPct)} r="3" fill="#ffc857" />
            </g>
          ))}

          {hover != null ? (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={pad.top}
              y2={pad.top + plotH}
              stroke="#05513d"
              strokeOpacity="0.2"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          ) : null}

          {points.map((p, i) => {
            const step = points.length > 14 ? Math.ceil(points.length / 7) : 1;
            if (i % step !== 0 && i !== points.length - 1) return null;
            return (
              <text
                key={`lbl-${p.label}-${i}`}
                x={x(i)}
                y={height - 6}
                textAnchor="middle"
                className="fill-slate-400 text-[10px]"
              >
                {p.label}
              </text>
            );
          })}
        </svg>

        {tooltip ? (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-xl border border-black/5 bg-white px-3 py-2 text-xs font-medium text-tis-navy shadow-soft"
            style={{
              left: `${(tooltip.x / width) * 100}%`,
              top: "8%",
            }}
          >
            <p className="text-[11px] text-tis-muted">{tooltip.label}</p>
            <p className="font-semibold">{tooltip.answered}</p>
            <p className="text-tis-muted">{tooltip.questions}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
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
    { label: "Answered from knowledge", value: success, color: "#05513d" },
    { label: "Needs attention", value: gaps, color: "#ffc857" },
    { label: "Human replies", value: human, color: "#9b7bff" },
    { label: "System error", value: errors, color: "#d64545" },
  ];
  const rawTotal = parts.reduce((s, p) => s + p.value, 0);
  const total = rawTotal || 1;
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const [hover, setHover] = useState<string | null>(null);

  let offset = 0;
  const segments = parts.map((part) => {
    const len = (part.value / total) * circ;
    const seg = {
      ...part,
      len,
      offset,
      pct: rawTotal === 0 ? 0 : Math.round((part.value / total) * 100),
    };
    offset += len;
    return seg;
  });

  const active = segments.find((s) => s.label === hover) ?? null;

  return (
    <div className="flex h-full flex-col">
      <ChartHeader
        icon={
          <IconWell tone="purple">
            <Sparkles className="h-4 w-4" strokeWidth={2.25} />
          </IconWell>
        }
        title="Answer outcomes"
        subtitle="How questions were handled in this period"
      />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
        <div className="relative shrink-0">
          <svg viewBox="0 0 140 140" className="h-36 w-36 xl:h-40 xl:w-40">
            <circle cx="70" cy="70" r={radius} fill="none" stroke="#ecece8" strokeWidth="20" />
            {segments.map((part) => (
              <circle
                key={part.label}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={part.color}
                strokeWidth={hover === part.label ? 22 : 20}
                strokeDasharray={`${part.len} ${circ - part.len}`}
                strokeDashoffset={-part.offset}
                transform="rotate(-90 70 70)"
                className="cursor-pointer transition-[stroke-width]"
                onMouseEnter={() => setHover(part.label)}
                onMouseLeave={() => setHover(null)}
              >
                <title>{`${part.label}: ${part.value} (${part.pct}%)`}</title>
              </circle>
            ))}
            <text x="70" y="64" textAnchor="middle" className="fill-tis-navy text-2xl font-bold">
              {active ? active.value : rawTotal}
            </text>
            <text x="70" y="84" textAnchor="middle" className="fill-slate-400 text-[11px] font-medium">
              {active ? active.pct + "%" : "questions"}
            </text>
          </svg>
          {active ? (
            <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-tis-ink px-2.5 py-1.5 text-[11px] font-medium text-white shadow-soft">
              {active.label}: {active.value} ({active.pct}%)
            </div>
          ) : null}
        </div>
        <ul className="w-full space-y-2.5 text-sm">
          {segments.map((part) => (
            <li
              key={part.label}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-1 transition ${
                hover === part.label ? "bg-slate-50" : ""
              }`}
              onMouseEnter={() => setHover(part.label)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="inline-flex items-center gap-2 text-tis-muted">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: part.color }} />
                {part.label}
              </span>
              <span className="font-semibold text-tis-navy">
                {part.value}
                <span className="ml-1 text-xs font-medium text-slate-400">({part.pct}%)</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
