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
    icon: "bg-[#e8f1fa] text-tis-sky",
    spark: "#4f8fcf",
    fill: "rgba(79, 143, 207, 0.16)",
  },
  green: {
    icon: "bg-emerald-50 text-tis-success",
    spark: "#1f9d6a",
    fill: "rgba(31, 157, 106, 0.16)",
  },
  purple: {
    icon: "bg-violet-50 text-violet-600",
    spark: "#7c5cbf",
    fill: "rgba(124, 92, 191, 0.16)",
  },
  teal: {
    icon: "bg-teal-50 text-teal-600",
    spark: "#0f9b8e",
    fill: "rgba(15, 155, 142, 0.16)",
  },
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

function Delta({ value }: { value: number | null }) {
  if (value == null) {
    return <p className="text-xs font-medium text-tis-muted">New this period</p>;
  }

  const up = value > 0;
  const down = value < 0;
  const color = up ? "text-tis-success" : down ? "text-tis-danger" : "text-tis-muted";
  const arrow = up ? "↑" : down ? "↓" : "→";

  return (
    <p className={`text-xs font-semibold ${color}`}>
      {arrow} {Math.abs(value)}% vs last 7 days
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
}: {
  label: string;
  value: string | number;
  definition: string;
  icon?: keyof typeof iconMap;
  tone?: keyof typeof toneMap;
  sparkline: number[];
  delta: number | null;
}) {
  const Icon = iconMap[icon] ?? iconMap.sessions;
  const colors = toneMap[tone] ?? toneMap.blue;

  return (
    <div className="card relative !p-4 hover:z-20 focus-within:z-20">
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colors.icon}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <p className="min-w-0 text-sm font-medium text-slate-600">{label}</p>
        <InfoTip label={label}>{definition}</InfoTip>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-3xl font-bold tracking-tight text-tis-navy">{value}</p>
          <div className="mt-1.5">
            <Delta value={delta} />
          </div>
        </div>
        <Sparkline values={sparkline} stroke={colors.spark} fill={colors.fill} />
      </div>
    </div>
  );
}
