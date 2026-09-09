import { InfoTip } from "@/components/info-tip";

const DELTA_COLORS = {
  up: { stroke: "#05513d", fill: "rgba(5, 81, 61, 0.18)" },
  down: { stroke: "#d64545", fill: "rgba(214, 69, 69, 0.18)" },
  flat: { stroke: "#5c635f", fill: "rgba(92, 99, 95, 0.14)" },
} as const;

const ACCENT = {
  green: "bg-tis-mist text-tis-navy",
  purple: "bg-[#f3eeff] text-[#6b4fd8]",
  amber: "bg-[#fff6e0] text-[#8a6500]",
  blue: "bg-[#eef1ff] text-tis-blue",
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
  delta,
  deltaLabel = "vs previous period",
  deltaUnit = "%",
}: {
  label: string;
  value: string | number;
  detail?: string;
  definition: string;
  accent?: keyof typeof ACCENT;
  sparkline: number[];
  delta: number | null;
  deltaLabel?: string;
  deltaUnit?: string;
}) {
  const trend = delta == null || delta === 0 ? "flat" : delta > 0 ? "up" : "down";
  const sparkColors = DELTA_COLORS[trend];

  return (
    <div className="card relative !p-4 hover:z-20 focus-within:z-20">
      <div className="flex items-start gap-2">
        <span
          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
            accent === "amber"
              ? "bg-tis-amber"
              : accent === "blue"
                ? "bg-tis-blue"
                : accent === "purple"
                  ? "bg-tis-lilac"
                  : "bg-tis-navy"
          }`}
        />
        <p className="min-w-0 flex-1 text-sm font-medium text-slate-600">{label}</p>
        <div className="shrink-0">
          <InfoTip label={label}>{definition}</InfoTip>
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
        <Sparkline values={sparkline} stroke={sparkColors.stroke} fill={sparkColors.fill} />
      </div>
    </div>
  );
}
