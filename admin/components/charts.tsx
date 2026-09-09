/** Lightweight SVG charts — no chart library required. */

export function PerformanceChart({
  points,
}: {
  points: {
    label: string;
    questions: number;
    answeredPct: number;
    attentionPct: number;
  }[];
}) {
  const width = 640;
  const height = 240;
  const pad = { top: 12, right: 8, bottom: 28, left: 32 };
  const maxQ = Math.max(1, ...points.map((p) => p.questions));
  const niceMax = niceCeil(maxQ);

  const x = (i: number) =>
    pad.left +
    (points.length <= 1 ? 0 : (i / (points.length - 1)) * (width - pad.left - pad.right));
  const yPct = (v: number) =>
    height - pad.bottom - (v / 100) * (height - pad.top - pad.bottom);
  const yBar = (v: number) =>
    height - pad.bottom - (v / niceMax) * (height - pad.top - pad.bottom);
  const barW = Math.max(
    2,
    Math.min(14, ((width - pad.left - pad.right) / Math.max(1, points.length)) * 0.45),
  );

  const line = (key: "answeredPct" | "attentionPct") =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${yPct(p[key]).toFixed(1)}`)
      .join(" ");

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap gap-4 text-xs font-medium text-tis-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-tis-navy" />
          Answered by Tina %
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-tis-amber" />
          Needs attention %
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-tis-lilac/50" />
          Total questions
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full">
        {points.map((p, i) => {
          const bx = x(i) - barW / 2;
          const top = yBar(p.questions);
          const h = height - pad.bottom - top;
          return (
            <rect
              key={`bar-${p.label}-${i}`}
              x={bx}
              y={top}
              width={barW}
              height={Math.max(0, h)}
              fill="rgba(155, 123, 255, 0.22)"
              rx="2"
            >
              <title>{`${p.label}: ${p.answeredPct}% answered, ${p.questions} questions`}</title>
            </rect>
          );
        })}
        <path
          d={line("answeredPct")}
          fill="none"
          stroke="#05513d"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={line("attentionPct")}
          fill="none"
          stroke="#ffc857"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => {
          const step = points.length > 14 ? Math.ceil(points.length / 7) : 1;
          if (i % step !== 0 && i !== points.length - 1) return null;
          return (
            <text
              key={`lbl-${p.label}-${i}`}
              x={x(i)}
              y={height - 8}
              textAnchor="middle"
              className="fill-slate-400 text-[10px]"
            >
              {p.label}
            </text>
          );
        })}
      </svg>
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
