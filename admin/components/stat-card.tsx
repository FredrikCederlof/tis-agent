import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  MessageSquare,
  MessagesSquare,
  Percent,
  Sparkles,
  Wrench,
} from "lucide-react";

const iconMap = {
  sessions: MessagesSquare,
  questions: MessageSquare,
  avg: Sparkles,
  success: Percent,
  grounded: CheckCircle2,
  gaps: HelpCircle,
  fixed: Wrench,
  errors: AlertTriangle,
} as const;

const toneMap = {
  navy: "bg-tis-mist text-tis-sky",
  green: "bg-emerald-50 text-tis-success",
  red: "bg-rose-50 text-tis-danger",
  gold: "bg-amber-50 text-tis-gold",
} as const;

export function StatCard({
  label,
  value,
  icon = "sessions",
  tone = "navy",
  hint,
}: {
  label: string;
  value: string | number;
  icon?: keyof typeof iconMap;
  tone?: keyof typeof toneMap;
  hint?: string;
}) {
  const Icon = iconMap[icon];
  return (
    <div className="card !p-4 transition hover:-translate-y-0.5 hover:shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-tis-muted">
            {label}
          </p>
          <p className="stat-value !text-2xl sm:!text-3xl">{value}</p>
          {hint && <p className="mt-1 text-xs text-tis-muted">{hint}</p>}
        </div>
        <div className={`rounded-xl p-2.5 ${toneMap[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
