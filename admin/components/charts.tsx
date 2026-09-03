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
  const pad = { top: 12, right: 12, bottom: 28, left: 36 };
  const maxY = Math.max(1, ...points.flatMap((p) => [p.sessions, p.questions, p.gaps]));
  const niceMax = niceCeil(maxY);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(niceMax * t));

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
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full min-w-[320px]">
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="#ecece8"
                strokeWidth="1"
              />
              <text
                x={pad.left - 8}
                y={y(tick) + 3}
                textAnchor="end"
                className="fill-slate-400 text-[10px]"
              >
                {tick}
              </text>
            </g>
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
          {points.map((p, i) => (
            <text
              key={p.label}
              x={x(i)}
              y={height - 8}
              textAnchor="middle"
              className="fill-slate-400 text-[10px]"
            >
              {p.label}
            </text>
          ))}
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

export function OutcomeDonut({
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
  const total = rawTotal || 1;
  let offset = 0;
  const radius = 54;
  const circ = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <svg viewBox="0 0 140 140" className="h-40 w-40 shrink-0">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#ecece8" strokeWidth="16" />
        {parts.map((part) => {
          const len = (part.value / total) * circ;
          const dash = `${len} ${circ - len}`;
          const el = (
            <circle
              key={part.label}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={part.color}
              strokeWidth="16"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
            />
          );
          offset += len;
          return el;
        })}
        <text x="70" y="66" textAnchor="middle" className="fill-tis-navy text-xl font-bold">
          {rawTotal}
        </text>
        <text x="70" y="84" textAnchor="middle" className="fill-slate-400 text-[10px] font-medium">
          Total
        </text>
      </svg>
      <ul className="w-full space-y-2.5 text-sm">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-tis-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: part.color }} />
              {part.label}
            </span>
            <span className="font-semibold text-tis-navy">
              {part.value}
              <span className="ml-1 text-xs font-medium text-slate-400">
                ({rawTotal === 0 ? 0 : Math.round((part.value / total) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
