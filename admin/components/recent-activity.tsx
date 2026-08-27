import { CheckCircle2, HelpCircle, Wrench } from "lucide-react";

type ActivityItem = {
  id: string;
  question: string;
  outcome: string;
  created_at: string;
};

function OutcomeIcon({ outcome }: { outcome: string }) {
  if (outcome === "success") {
    return <CheckCircle2 className="h-4 w-4 text-tis-success" />;
  }
  if (outcome === "fixed_answer") {
    return <Wrench className="h-4 w-4 text-tis-sky" />;
  }
  return <HelpCircle className="h-4 w-4 text-tis-danger" />;
}

function outcomeLabel(outcome: string) {
  if (outcome === "success") return "Answered";
  if (outcome === "fixed_answer") return "Fixed answer";
  if (outcome === "error") return "Error";
  return "Unanswered";
}

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className="card text-sm text-tis-muted">
        No WhatsApp activity yet. When parents message Tina, recent questions appear here.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-white p-1.5 shadow-sm">
              <OutcomeIcon outcome={item.outcome} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium text-tis-navy">{item.question}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-tis-muted">
                <span>{outcomeLabel(item.outcome)}</span>
                <span>·</span>
                <span>{new Date(item.created_at).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
