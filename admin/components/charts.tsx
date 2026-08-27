/** Lightweight SVG charts — no chart library required. */

export function ActivityChart({
  points,
}: {
  points: { label: string; sessions: number; questions: number; gaps: number }[];
}) {
  const width = 560;
  const height = 220;
  const pad = 28;
  const maxY = Math.max(1, ...points.flatMap((p) => [p.sessions, p.questions, p.gaps]));

  const x = (i: number) =>
    pad + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (width - pad * 2));
  const y = (v: number) => height - pad - (v / maxY) * (height - pad * 2);

  const path = (key: "sessions" | "questions" | "gaps") =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p[key])}`)
      .join(" ");

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full min-w-[320px]">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={pad}
            x2={width - pad}
            y1={y(maxY * t)}
            y2={y(maxY * t)}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
        ))}
        <path d={path("sessions")} fill="none" stroke="#4f8fcf" strokeWidth="2.5" />
        <path d={path("questions")} fill="none" stroke="#1f9d6a" strokeWidth="2.5" />
        <path d={path("gaps")} fill="none" stroke="#d64545" strokeWidth="2.5" />
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
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-tis-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-tis-sky" /> Sessions
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-tis-success" /> Questions
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-tis-danger" /> Unanswered
        </span>
      </div>
    </div>
  );
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
    { label: "Grounded", value: success, color: "#1f9d6a" },
    { label: "Gaps", value: gaps, color: "#d64545" },
    { label: "Fixed", value: fixed, color: "#4f8fcf" },
    { label: "Errors", value: errors, color: "#94a3b8" },
  ];
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  let offset = 0;
  const radius = 54;
  const circ = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#eef2f7" strokeWidth="16" />
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
        <text
          x="70"
          y="66"
          textAnchor="middle"
          className="fill-tis-navy text-xl font-bold"
        >
          {total === 1 && success + gaps + fixed + errors === 0 ? "0" : success + gaps + fixed + errors}
        </text>
        <text x="70" y="84" textAnchor="middle" className="fill-slate-400 text-[10px]">
          questions
        </text>
      </svg>
      <ul className="w-full space-y-2 text-sm">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-tis-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: part.color }} />
              {part.label}
            </span>
            <span className="font-semibold text-tis-navy">
              {part.value}
              <span className="ml-1 text-xs font-medium text-slate-400">
                ({Math.round((part.value / total) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
