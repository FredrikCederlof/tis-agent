"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BookOpen, MessageCircle, Sparkles, type LucideIcon } from "lucide-react";
import { InfoTip } from "@/components/info-tip";

type Accent = "green" | "purple" | "amber" | "blue";

const ACCENTS: Record<
  Accent,
  { iconBg: string; iconFg: string; stroke: string; fill: string; Icon: LucideIcon }
> = {
  green: {
    iconBg: "bg-[#e7f3ec]",
    iconFg: "text-tis-navy",
    stroke: "#05513d",
    fill: "rgba(5, 81, 61, 0.16)",
    Icon: MessageCircle,
  },
  purple: {
    iconBg: "bg-[#f3eeff]",
    iconFg: "text-[#6b4fd8]",
    stroke: "#9b7bff",
    fill: "rgba(155, 123, 255, 0.18)",
    Icon: Sparkles,
  },
  amber: {
    iconBg: "bg-[#fff6e0]",
    iconFg: "text-[#8a6500]",
    stroke: "#ffc857",
    fill: "rgba(255, 200, 87, 0.28)",
    Icon: AlertTriangle,
  },
  blue: {
    iconBg: "bg-[#eef1ff]",
    iconFg: "text-tis-blue",
    stroke: "#4d6bff",
    fill: "rgba(77, 107, 255, 0.16)",
    Icon: BookOpen,
  },
};

function smoothAreaPath(
  coords: { x: number; y: number }[],
  height: number,
): { line: string; area: string } {
  if (coords.length === 1) {
    const p = coords[0];
    const line = `M ${p.x} ${p.y}`;
    return { line, area: `${line} L ${p.x} ${height} L ${p.x} ${height} Z` };
  }

  let line = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? i : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    line += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  const last = coords[coords.length - 1];
  const first = coords[0];
  const area = `${line} L ${last.x.toFixed(1)} ${height} L ${first.x.toFixed(1)} ${height} Z`;
  return { line, area };
}

function AreaSparkline({
  values,
  labels,
  stroke,
  fill,
  valueFormatter,
}: {
  values: number[];
  labels?: string[];
  stroke: string;
  fill: string;
  valueFormatter?: (v: number) => string;
}) {
  const width = 120;
  const height = 56;
  const padX = 4;
  const padY = 6;
  const series = values.length >= 2 ? values : [0, 0];
  const max = Math.max(1, ...series);
  const coords = series.map((v, i) => {
    const x = padX + (i / Math.max(1, series.length - 1)) * (width - padX * 2);
    const y = height - padY - (v / max) * (height - padY * 2);
    return { x, y, v, label: labels?.[i] };
  });
  const { line, area } = smoothAreaPath(coords, height);
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div className="relative shrink-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-14 w-[7.5rem]"
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Trend sparkline"
      >
        <path d={area} fill={fill} />
        <path
          d={line}
          fill="none"
          stroke={stroke}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hover === i ? 3.5 : 0}
            fill={stroke}
            className="transition-[r]"
          />
        ))}
        {coords.map((p, i) => (
          <rect
            key={`hit-${i}`}
            x={p.x - Math.max(6, (width - padX * 2) / series.length / 2)}
            y={0}
            width={Math.max(12, (width - padX * 2) / series.length)}
            height={height}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
      {hover != null ? (
        <div className="pointer-events-none absolute -top-2 left-1/2 z-30 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-tis-ink px-2.5 py-1.5 text-[11px] font-medium text-white shadow-soft">
          {coords[hover].label ? `${coords[hover].label}: ` : ""}
          {valueFormatter ? valueFormatter(coords[hover].v) : coords[hover].v}
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
  const color = up ? "text-tis-success" : down ? "text-tis-danger" : "text-tis-muted";
  const arrow = up ? "↑" : down ? "↓" : "→";
  return (
    <p className={`text-xs font-semibold ${color}`}>
      {arrow} {Math.abs(value)}
      {unit} {label}
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
  deltaLabel = "vs previous period",
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
    <div className="card relative overflow-hidden !p-4 hover:z-20 focus-within:z-20">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${theme.iconBg} ${theme.iconFg}`}
        >
          <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-sm font-medium text-slate-600">{label}</p>
            <div className="shrink-0">
              <InfoTip label={label}>{definition}</InfoTip>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-3xl font-bold tracking-tight text-tis-navy">{value}</p>
          {detail ? <p className="mt-1 text-xs text-tis-muted">{detail}</p> : null}
          <div className="mt-1.5">
            <Delta value={delta} label={deltaLabel} unit={deltaUnit} />
          </div>
        </div>
        <AreaSparkline
          values={sparkline}
          labels={sparklineLabels}
          stroke={theme.stroke}
          fill={theme.fill}
          valueFormatter={formatter}
        />
      </div>
    </div>
  );
}
