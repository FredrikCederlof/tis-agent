"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BookOpen, MessageCircle, Sparkles, type LucideIcon } from "lucide-react";
import { InfoTip } from "@/components/info-tip";
import { formatSavedTime } from "@/lib/time-saved";

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
        className="h-[48px] w-[96px] max-w-full cursor-crosshair sm:h-[56px] sm:w-[112px]"
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
  icon,
  sparkline,
  sparklineLabels,
  sparkFormat = "number",
  delta,
  deltaFormatted,
  deltaLabel = "vs previous 30 days",
  deltaUnit = "%",
  tipAlign = "start",
}: {
  label: string;
  value: string | number;
  detail?: string;
  definition: string;
  accent?: Accent;
  icon?: LucideIcon;
  sparkline?: number[];
  sparklineLabels?: string[];
  sparkFormat?: "number" | "percent" | "duration";
  delta?: number | null;
  deltaFormatted?: string | null;
  deltaLabel?: string;
  deltaUnit?: string;
  tipAlign?: "start" | "end";
}) {
  const theme = ACCENTS[accent];
  const Icon = icon ?? theme.Icon;
  const formatter = useMemo(
    () => (v: number) => {
      if (sparkFormat === "percent") return `${v}%`;
      if (sparkFormat === "duration") return formatSavedTime(v);
      return String(v);
    },
    [sparkFormat],
  );

  return (
    <div
      className={`relative z-0 flex min-h-[148px] min-w-0 flex-col justify-between overflow-visible rounded-2xl border p-4 shadow-card hover:z-30 focus-within:z-30 sm:p-5 ${theme.card}`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${theme.iconBg} ${theme.iconFg}`}
        >
          <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </span>
        <p className="min-w-0 pt-1 text-sm font-semibold text-tis-navy">{label}</p>
        <div className="relative z-40 mt-1 shrink-0">
          <InfoTip label={label} align={tipAlign}>
            {definition}
          </InfoTip>
        </div>
      </div>
      <div className="mt-4 flex min-w-0 items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <p className="font-display text-3xl font-bold tracking-tight text-tis-navy">{value}</p>
            {detail ? <p className="text-xs text-tis-muted">{detail}</p> : null}
          </div>
          {deltaFormatted !== undefined ? (
            <div className="mt-1.5">
              {deltaFormatted == null ? (
                <p className="text-xs font-medium text-tis-muted">New this period</p>
              ) : (
                <p
                  className={`text-xs font-semibold leading-snug ${
                    deltaFormatted.startsWith("→") ? "text-tis-muted" : "text-emerald-600"
                  }`}
                >
                  {deltaFormatted}
                  <span className="mt-0.5 block font-medium text-tis-muted">{deltaLabel}</span>
                </p>
              )}
            </div>
          ) : delta !== undefined ? (
            <div className="mt-1.5">
              <Delta value={delta} label={deltaLabel} unit={deltaUnit} />
            </div>
          ) : null}
        </div>
        {sparkline ? (
          <BarSparkline
            values={sparkline}
            labels={sparklineLabels}
            color={theme.bar}
            valueFormatter={formatter}
          />
        ) : null}
      </div>
    </div>
  );
}
