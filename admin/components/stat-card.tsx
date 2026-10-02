"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BookOpen, Clock, MessageCircle, Sparkles, type LucideIcon } from "lucide-react";
import { InfoTip } from "@/components/info-tip";
import { formatSavedTime } from "@/lib/time-saved";

type Accent = "green" | "purple" | "amber" | "blue";
type IconName = "clock" | "message" | "sparkles" | "alert" | "book";

const ICONS: Record<IconName, LucideIcon> = {
  clock: Clock,
  message: MessageCircle,
  sparkles: Sparkles,
  alert: AlertTriangle,
  book: BookOpen,
};

const ACCENTS: Record<
  Accent,
  { iconBg: string; iconFg: string; bar: string; Icon: LucideIcon }
> = {
  green: {
    iconBg: "bg-[var(--tina-icon-green-bg,#ecfbdd)]",
    iconFg: "text-[var(--tina-chart-green,#2b725b)]",
    bar: "#7ed9a0",
    Icon: MessageCircle,
  },
  purple: {
    iconBg: "bg-[var(--tina-icon-purple-bg,#eee8ff)]",
    iconFg: "text-[var(--tina-chart-purple,#9170ff)]",
    bar: "#c4b4ff",
    Icon: Sparkles,
  },
  amber: {
    iconBg: "bg-[var(--tina-icon-amber-bg,#fff3dd)]",
    iconFg: "text-[#8a6500]",
    bar: "#ffc857",
    Icon: AlertTriangle,
  },
  blue: {
    iconBg: "bg-[var(--tina-icon-blue-bg,#e7efff)]",
    iconFg: "text-[var(--tina-chart-blue,#6096f8)]",
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
  const width = 96;
  const height = 36;
  const padX = 1;
  const padY = 2;
  const series = values.length > 0 ? values.slice(-12) : [0];
  const seriesLabels = labels ? labels.slice(-series.length) : [];
  const max = Math.max(1, ...series);
  const gap = 2;
  const barW = Math.max(3, (width - padX * 2 - gap * (series.length - 1)) / series.length);
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
    <div className="relative shrink-0 self-end">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-9 w-[72px] max-w-full cursor-crosshair sm:w-20"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => onMove(e.clientX, e.currentTarget)}
        role="img"
        aria-label="Trend bars"
      >
        {series.map((v, i) => {
          const h = Math.max(3, (v / max) * (height - padY * 2));
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
                rx={Math.min(2, barW / 2)}
                fill={color}
                opacity={hover == null || hover === i ? 1 : 0.45}
              />
            </g>
          );
        })}
      </svg>
      {hover != null ? (
        <div className="pointer-events-none absolute -top-2 left-1/2 z-30 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-tina-active px-2.5 py-1.5 text-[11px] font-medium text-white shadow-soft">
          {seriesLabels[hover] ? `${seriesLabels[hover]}: ` : ""}
          {valueFormatter ? valueFormatter(series[hover]) : series[hover]}
        </div>
      ) : null}
    </div>
  );
}

function DeltaPill({
  text,
  label,
  positive,
  neutral,
}: {
  text: string;
  label: string;
  positive: boolean;
  neutral: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          neutral
            ? "bg-tina-subtle text-tina-muted"
            : positive
              ? "bg-[var(--tina-success-soft,#effbea)] text-[var(--tina-success,#00852d)]"
              : "bg-[var(--tina-danger-soft,#ffe9ed)] text-[var(--tina-danger,#d71938)]"
        }`}
      >
        {text}
      </span>
      <span className="truncate text-[11px] font-medium text-tina-muted">{label}</span>
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  definition,
  accent = "green",
  iconName,
  sparkline,
  sparklineLabels,
  sparkFormat = "number",
  delta,
  deltaFormatted,
  deltaLabel = "vs previous period",
  deltaUnit = "%",
  tipAlign = "start",
}: {
  label: string;
  value: string | number;
  detail?: string;
  definition: string;
  accent?: Accent;
  iconName?: IconName;
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
  const Icon = iconName ? ICONS[iconName] : theme.Icon;
  const formatter = useMemo(
    () => (v: number) => {
      if (sparkFormat === "percent") return `${v}%`;
      if (sparkFormat === "duration") return formatSavedTime(v);
      return String(v);
    },
    [sparkFormat],
  );

  let deltaPill: { text: string; positive: boolean; neutral: boolean } | null = null;
  if (deltaFormatted !== undefined) {
    if (deltaFormatted == null) {
      deltaPill = { text: "New", positive: false, neutral: true };
    } else {
      const neutral = deltaFormatted.startsWith("→");
      const positive = deltaFormatted.startsWith("↑") || deltaFormatted.startsWith("+");
      deltaPill = { text: deltaFormatted, positive, neutral };
    }
  } else if (delta !== undefined) {
    if (delta == null) {
      deltaPill = { text: "New", positive: false, neutral: true };
    } else {
      const up = delta > 0;
      const down = delta < 0;
      const arrow = up ? "↑" : down ? "↓" : "→";
      deltaPill = {
        text: `${arrow} ${Math.abs(delta)}${deltaUnit}`,
        positive: up,
        neutral: !up && !down,
      };
    }
  }

  return (
    <div className="stat-bezel z-0 h-full hover:z-30 focus-within:z-30">
      <div className="stat-bezel-inner h-full">
        <div className="flex h-full min-h-[148px] items-stretch gap-3">
          <span
            className={`mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] ${theme.iconBg} ${theme.iconFg}`}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 text-sm font-medium leading-snug text-tina-secondary">{label}</p>
              <div className="relative z-40 shrink-0">
                <InfoTip label={label} align={tipAlign}>
                  {definition}
                </InfoTip>
              </div>
            </div>
            {/* Pin value / detail / delta / sparkline to the card bottom */}
            <div className="mt-auto flex items-end justify-between gap-3 pt-4">
              <div className="flex min-w-0 flex-col justify-end">
                <p className="font-display text-[28px] font-bold leading-none tracking-[-0.03em] text-tina-text tabular-nums sm:text-[32px]">
                  {value}
                </p>
                <p className="mt-1 min-h-[1rem] truncate text-xs text-tina-muted">
                  {detail || "\u00a0"}
                </p>
                <div className="mt-2 min-h-[22px]">
                  {deltaPill ? (
                    <DeltaPill
                      text={deltaPill.text}
                      label={deltaLabel}
                      positive={deltaPill.positive}
                      neutral={deltaPill.neutral}
                    />
                  ) : null}
                </div>
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
        </div>
      </div>
    </div>
  );
}
