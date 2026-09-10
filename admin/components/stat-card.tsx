"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BookOpen, MessageCircle, Sparkles, type LucideIcon } from "lucide-react";
import { InfoTip } from "@/components/info-tip";

type Accent = "green" | "purple" | "amber" | "blue";

const ACCENTS: Record<
  Accent,
  { card: string; iconBg: string; iconFg: string; bar: string; Icon: LucideIcon }
> = {
  green: {
    card: "bg-[#e8f6ee] border-transparent",
    iconBg: "bg-[#d4eedc]",
    iconFg: "text-tis-navy",
    bar: "#7ed9a0",
    Icon: MessageCircle,
  },
  purple: {
    card: "bg-[#f3f0ff] border-transparent",
    iconBg: "bg-[#ebe4ff]",
    iconFg: "text-[#6b4fd8]",
    bar: "#c4b4ff",
    Icon: Sparkles,
  },
  amber: {
    card: "bg-[#fff6e4] border-transparent",
    iconBg: "bg-[#ffe9b8]",
    iconFg: "text-[#8a6500]",
    bar: "#ffc857",
    Icon: AlertTriangle,
  },
  blue: {
    card: "bg-[#eef2ff] border-transparent",
    iconBg: "bg-[#dde4ff]",
    iconFg: "text-tis-blue",
    bar: "#8aa0ff",
    Icon: BookOpen,
  },
};

function BarSparkline({
  values,
  labels,
  color,
  valueFormatter,
}: {
  values: number[];
  labels?: string[];
  color: string;
  valueFormatter?: (v: number) => string;
}) {
  const width = 128;
  const height = 56;
  const padX = 1;
  const padY = 2;
  const series = values.length > 0 ? values.slice(-12) : [0];
  const seriesLabels = labels ? labels.slice(-series.length) : [];
  const max = Math.max(1, ...series);
  const gap = 2.4;
  const barW = Math.max(4, (width - padX * 2 - gap * (series.length - 1)) / series.length);
  const [hover, setHover] = useState<number | null>(null);

  function onMove(clientX: number, target: SVGSVGElement) {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0) return;
    const rel = ((clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < series.length; i++) {
      const cx = padX + i * (barW + gap) + barW / 2;
      const d = Math.abs(cx - rel);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHover(best);
  }

  return (
    <div className="relative shrink-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[56px] w-[128px] cursor-crosshair"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => onMove(e.clientX, e.currentTarget)}
        role="img"
        aria-label="Trend bars"
      >
        {series.map((v, i) => {
          const h = Math.max(4, (v / max) * (height - padY * 2));
          const x = padX + i * (barW + gap);
          const y = height - padY - h;
          return (
            <g key={i}>
              <rect x={x} y={0} width={barW} height={height} fill="transparent" />
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={barW / 2}
                fill={color}
                opacity={hover == null || hover === i ? 1 : 0.45}
              />
            </g>
          );
        })}
      </svg>
      {hover != null ? (
        <div className="pointer-events-none absolute -top-2 left-1/2 z-30 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-tis-ink px-2.5 py-1.5 text-[11px] font-medium text-white shadow-soft">
          {seriesLabels[hover] ? `${seriesLabels[hover]}: ` : ""}
          {valueFormatter ? valueFormatter(series[hover]) : series[hover]}
        </div>
      ) : null}
    </div>
  );
}

function Delta({
  value,
  label,
  unit = "%",
}: {
  value: number | null;
  label: string;
  unit?: string;
}) {
  if (value == null) {
    return <p className="text-xs font-medium text-tis-muted">New this period</p>;
  }
  const up = value > 0;
  const down = value < 0;
  const color = up || down ? "text-emerald-600" : "text-tis-muted";
  const arrow = up ? "↑" : down ? "↓" : "→";
  return (
    <p className={`text-xs font-semibold leading-snug ${color}`}>
      {arrow} {Math.abs(value)}
      {unit}
      <span className="mt-0.5 block font-medium text-tis-muted">{label}</span>
    </p>
  );
}

export function StatCard({
  label,
  value,
  detail,
  definition,
  accent = "green",
  sparkline,
  sparklineLabels,
  sparkFormat = "number",
  delta,
  deltaLabel = "vs previous 30 days",
  deltaUnit = "%",
}: {
  label: string;
  value: string | number;
  detail?: string;
  definition: string;
  accent?: Accent;
  sparkline: number[];
  sparklineLabels?: string[];
  sparkFormat?: "number" | "percent";
  delta: number | null;
  deltaLabel?: string;
  deltaUnit?: string;
}) {
  const theme = ACCENTS[accent];
  const Icon = theme.Icon;
  const formatter = useMemo(
    () => (v: number) => (sparkFormat === "percent" ? `${v}%` : String(v)),
    [sparkFormat],
  );

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 shadow-card hover:z-20 focus-within:z-20 sm:p-5 ${theme.card}`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${theme.iconBg} ${theme.iconFg}`}
        >
          <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </span>
        <p className="min-w-0 flex-1 text-sm font-semibold text-tis-navy">{label}</p>
        <div className="shrink-0">
          <InfoTip label={label}>{definition}</InfoTip>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <p className="font-display text-3xl font-bold tracking-tight text-tis-navy">{value}</p>
            {detail ? <p className="text-xs text-tis-muted">{detail}</p> : null}
          </div>
          <div className="mt-1.5">
            <Delta value={delta} label={deltaLabel} unit={deltaUnit} />
          </div>
        </div>
        <BarSparkline
          values={sparkline}
          labels={sparklineLabels}
          color={theme.bar}
          valueFormatter={formatter}
        />
      </div>
    </div>
  );
}
