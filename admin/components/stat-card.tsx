import {
  CheckCircle2,
  MessageSquare,
  MessagesSquare,
  Users,
} from "lucide-react";
import { InfoTip } from "@/components/info-tip";

const iconMap = {
  sessions: Users,
  questions: MessageSquare,
  avg: MessagesSquare,
  success: CheckCircle2,
} as const;

const toneMap = {
  blue: {
    icon: "bg-tis-mist text-tis-navy dark:bg-white/10 dark:text-tis-acid",
  },
  green: {
    icon: "bg-[#f3ffe0] text-tis-navy dark:bg-white/10 dark:text-tis-acid",
  },
  purple: {
    icon: "bg-slate-100 text-tis-ink dark:bg-white/10 dark:text-tis-cream",
  },
  teal: {
    icon: "bg-tis-mist text-tis-navy dark:bg-white/10 dark:text-tis-acid",
  },
} as const;

const DELTA_COLORS = {
  up: { stroke: "#05513d", fill: "rgba(5, 81, 61, 0.18)" },
  down: { stroke: "#d64545", fill: "rgba(214, 69, 69, 0.18)" },
  flat: { stroke: "#5c635f", fill: "rgba(92, 99, 95, 0.14)" },
} as const;

function Sparkline({
  values,
  stroke,
  fill,
}: {
  values: number[];
  stroke: string;
  fill: string;
}) {
  const width = 96;
  const height = 44;
  const padX = 2;
  const padY = 4;
  const series = values.length >= 2 ? values : [0, 0];
  const max = Math.max(1, ...series);
  const coords = series.map((v, i) => {
    const x = padX + (i / Math.max(1, series.length - 1)) * (width - padX * 2);
    const y = height - padY - (v / max) * (height - padY * 2);
    return { x, y };
  });
  const line = coords.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${height} L ${coords[0].x.toFixed(1)} ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-11 w-24 shrink-0" aria-hidden>
      <path d={area} fill={fill} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Delta({ value, label }: { value: number | null; label: string }) {
  if (value == null) {
    return <p className="text-xs font-medium text-tis-muted">New this period</p>;
  }

  const up = value > 0;
  const down = value < 0;
  const color = up ? "text-tis-success" : down ? "text-tis-danger" : "text-tis-muted";
  const arrow = up ? "↑" : down ? "↓" : "→";

  return (
    <p className={`text-xs font-semibold ${color}`}>
      {arrow} {Math.abs(value)}% {label}
    </p>
  );
}

export function StatCard({
  label,
  value,
  definition,
  icon = "sessions",
  tone = "blue",
  sparkline,
  delta,
  deltaLabel = "vs previous period",
}: {
  label: string;
  value: string | number;
  definition: string;
  icon?: keyof typeof iconMap;
  tone?: keyof typeof toneMap;
  sparkline: number[];
  delta: number | null;
  deltaLabel?: string;
}) {
  const Icon = iconMap[icon] ?? iconMap.sessions;
  const colors = toneMap[tone] ?? toneMap.blue;
  const trend = delta == null || delta === 0 ? "flat" : delta > 0 ? "up" : "down";
  const sparkColors = DELTA_COLORS[trend];

  return (
    <div className="card relative !p-4 hover:z-20 focus-within:z-20">
      <div className="flex items-start gap-2">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colors.icon}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <p className="min-w-0 flex-1 pt-1 text-sm font-medium text-slate-600 dark:text-white/70">
          {label}
        </p>
        <div className="shrink-0 pt-0.5">
          <InfoTip label={label}>{definition}</InfoTip>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-3xl font-bold tracking-tight text-tis-navy dark:text-tis-cream">
            {value}
          </p>
          <div className="mt-1.5">
            <Delta value={delta} label={deltaLabel} />
          </div>
        </div>
        <Sparkline values={sparkline} stroke={sparkColors.stroke} fill={sparkColors.fill} />
      </div>
    </div>
  );
}
