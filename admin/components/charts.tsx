/** Lightweight SVG charts — no chart library required. */

const SERIES = [
  { key: "sessions" as const, label: "Sessions", color: "#05513d" },
  { key: "questions" as const, label: "Questions", color: "#1a191b" },
  { key: "gaps" as const, label: "Unanswered", color: "#d64545" },
];

export function ActivityChart({
  points,
}: {
  points: { label: string; sessions: number; questions: number; gaps: number }[];
}) {
  const width = 640;
  const height = 240;
  // Tight pads so series use nearly the full widget width.
  const pad = { top: 8, right: 4, bottom: 28, left: 28 };
  const maxY = Math.max(1, ...points.flatMap((p) => [p.sessions, p.questions, p.gaps]));
  const niceMax = niceCeil(maxY);
  const ticks = [0, 0.5, 1].map((t) => Math.round(niceMax * t));

  const x = (i: number) =>
    pad.left +
    (points.length <= 1 ? 0 : (i / (points.length - 1)) * (width - pad.left - pad.right));
  const y = (v: number) =>
    height - pad.bottom - (v / niceMax) * (height - pad.top - pad.bottom);

  const line = (key: "sessions" | "questions" | "gaps") =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`)
      .join(" ");

  const area = (key: "sessions" | "questions" | "gaps") => {
    if (points.length === 0) return "";
    const lastX = x(points.length - 1).toFixed(1);
    const firstX = x(0).toFixed(1);
    const base = y(0).toFixed(1);
    return `${line(key)} L ${lastX} ${base} L ${firstX} ${base} Z`;
  };

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap gap-4 text-xs font-medium text-tis-muted">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full">
          {ticks.map((tick) => (
            <text
              key={tick}
              x={pad.left - 6}
              y={y(tick) + 3}
              textAnchor="end"
              className="fill-slate-400 text-[10px] dark:fill-white/40"
            >
              {tick}
            </text>
          ))}
          <path d={area("sessions")} fill="rgba(5, 81, 61, 0.08)" />
          {SERIES.map((s) => (
            <path
              key={s.key}
              d={line(s.key)}
              fill="none"
              stroke={s.color}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {points.map((p, i) => {
            // Sparse x labels when many days so the chart stays readable.
            const step = points.length > 14 ? Math.ceil(points.length / 7) : 1;
            if (i % step !== 0 && i !== points.length - 1) return null;
            return (
              <text
                key={`${p.label}-${i}`}
                x={x(i)}
                y={height - 8}
                textAnchor="middle"
                className="fill-slate-400 text-[10px] dark:fill-white/40"
              >
                {p.label}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function niceCeil(n: number): number {
  if (n <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(n));
  const norm = n / mag;
  const nice = norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

/** Vertical outcome bars with rounded top corners (replaces OutcomeDonut). */
export function OutcomeBars({
  success,
  gaps,
  fixed,
  errors,
}: {
  success: number;
  gaps: number;
  fixed: number;
  errors: number;
}) {
  const parts = [
    { label: "Grounded", value: success, color: "#05513d" },
    { label: "Gaps", value: gaps, color: "#d64545" },
    { label: "Fixed", value: fixed, color: "#90ff09" },
    { label: "Errors", value: errors, color: "#1a191b" },
  ];
  const rawTotal = parts.reduce((s, p) => s + p.value, 0);
  const max = Math.max(1, ...parts.map((p) => p.value));
  const chartH = 160;
  const chartW = 280;
  const barW = 44;
  const gap = 24;
  const baseY = chartH - 8;
  const startX = 20;

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
      <svg viewBox={`0 0 ${chartW} ${chartH + 28}`} className="h-48 w-full max-w-[320px] shrink-0">
        {parts.map((part, i) => {
          const h = (part.value / max) * (chartH - 24);
          const x = startX + i * (barW + gap);
          const y = baseY - h;
          const r = Math.min(10, barW / 2, h / 2);
          const path =
            h <= 0
              ? ""
              : `M ${x} ${baseY} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + barW - r} ${y} Q ${x + barW} ${y} ${x + barW} ${y + r} L ${x + barW} ${baseY} Z`;
          return (
            <g key={part.label}>
              {h > 0 && <path d={path} fill={part.color} />}
              <text
                x={x + barW / 2}
                y={chartH + 18}
                textAnchor="middle"
                className="fill-tis-muted text-[10px] font-semibold"
              >
                {part.label}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="w-full space-y-2.5 text-sm">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-tis-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: part.color }} />
              {part.label}
            </span>
            <span className="font-semibold text-tis-navy dark:text-tis-cream">
              {part.value}
              <span className="ml-1 text-xs font-medium text-slate-400">
                ({rawTotal === 0 ? 0 : Math.round((part.value / rawTotal) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** @deprecated Prefer OutcomeBars — kept for any residual imports. */
export function OutcomeDonut(props: {
  success: number;
  gaps: number;
  fixed: number;
  errors: number;
}) {
  return <OutcomeBars {...props} />;
}
