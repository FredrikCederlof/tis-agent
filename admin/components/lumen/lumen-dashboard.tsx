import Link from "next/link";
import { DashboardDateRange } from "@/components/dashboard-date-range";
import {
  LumenOutcomeBar,
  LumenPerformanceChart,
  LumenSparkline,
} from "@/components/lumen/lumen-charts";
import { attentionReason, type KnowledgeGap } from "@/lib/dashboard";

import "@/design/lumen-ui/styles.css";
import "@/design/lumen-ui/theme.css";
import "./lumen-dashboard.css";

export type LumenAttentionRow = {
  id: string;
  session_id: string;
  question: string;
  outcome: string;
  created_at: string;
  wa_from?: string | null;
};

export type LumenDashboardProps = {
  from: string;
  to: string;
  dayCount: number;
  periodNoun: string;
  vsPrevious: string;
  loadError?: string;
  timeSavedLabel: string;
  timeSavedDelta: string | null;
  timeSavedSeries: number[];
  dayLabels: string[];
  answeredPct: number;
  answeredDetail: string;
  answeredDelta: number | null;
  answeredSeries: number[];
  attentionCount: number;
  attentionDetail: string;
  attentionDelta: number | null;
  attentionSeries: number[];
  coveragePct: number;
  coverageDelta: number | null;
  coverageSeries: number[];
  performancePoints: {
    label: string;
    questions: number;
    answeredPct: number;
    attentionPct: number;
  }[];
  outcomes: { success: number; gaps: number; human: number; errors: number };
  topGaps: KnowledgeGap[];
  attentionRows: LumenAttentionRow[];
};

function relativeTime(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function maskParent(waFrom: string | null | undefined): string {
  const digits = (waFrom || "").replace(/\D/g, "");
  return digits.length < 4 ? "—" : `•• •${digits.slice(-4)}`;
}

/** Lumen shows direction with an arrow and words, never colour alone. */
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
    return <p className="l-delta flat">New this period</p>;
  }
  const changed = value !== 0;
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "→";
  return (
    <p className={`l-delta ${changed ? "up" : "flat"}`}>
      {arrow} {Math.abs(value)}
      {unit}
      <span className="l-small l-muted" style={{ display: "block", fontWeight: 500 }}>
        {label}
      </span>
    </p>
  );
}

function Kpi({
  label,
  value,
  detail,
  chip,
  accentChip,
  children,
  spark,
}: {
  label: string;
  value: string | number;
  detail?: string;
  chip?: string;
  accentChip?: boolean;
  children: React.ReactNode;
  spark: React.ReactNode;
}) {
  return (
    <article className="l-card l-kpi">
      <div className="l-kpi-top">
        <span className="l-label">{label}</span>
        {chip ? (
          <span className={`l-chip ${accentChip ? "accent" : ""}`}>{chip}</span>
        ) : null}
      </div>
      <div>
        <strong className="l-kpi-value">{value}</strong>
        {detail ? (
          <p className="l-small l-muted" style={{ marginTop: 8 }}>
            {detail}
          </p>
        ) : null}
      </div>
      <div className="l-kpi-foot">
        {children}
        {spark}
      </div>
    </article>
  );
}

export function LumenDashboard(props: LumenDashboardProps) {
  const {
    from,
    to,
    dayCount,
    periodNoun,
    vsPrevious,
    loadError,
    dayLabels,
    topGaps,
    attentionRows,
  } = props;

  const backHref = `/?from=${from}&to=${to}`;

  return (
    <div className="lumen-ui l-dash-root">
      <div className="l-dash">
        <div className="l-preview-note">
          <span>
            Lumen UI preview · dashboard only. Every other page keeps the current design.
          </span>
          <Link className="l-btn outline compact" href={backHref}>
            Back to current design
          </Link>
        </div>

        <header className="l-dash-head">
          <div className="l-stack" style={{ gap: 12 }}>
            <h1 className="l-page-title">Dashboard</h1>
            <p className="l-muted" style={{ maxWidth: 560 }}>
              An overview of Tina&apos;s performance, knowledge and what needs your attention.
            </p>
          </div>
          <div className="l-dash-actions">
            <span className="l-chip ok">All systems operational</span>
            <DashboardDateRange from={from} to={to} />
          </div>
        </header>

        {loadError ? (
          <p className="l-notice">Could not load dashboard interactions: {loadError}</p>
        ) : null}

        <section className="l-kpis" aria-label="Key metrics">
          <Kpi
            label="Time saved"
            value={props.timeSavedLabel}
            detail={`Across the last ${dayCount} ${periodNoun}`}
            spark={
              <LumenSparkline
                values={props.timeSavedSeries}
                labels={dayLabels}
                format="duration"
              />
            }
          >
            {props.timeSavedDelta == null ? (
              <p className="l-delta flat">New this period</p>
            ) : (
              <p
                className={`l-delta ${props.timeSavedDelta.startsWith("→") ? "flat" : "up"}`}
              >
                {props.timeSavedDelta}
                <span
                  className="l-small l-muted"
                  style={{ display: "block", fontWeight: 500 }}
                >
                  {vsPrevious}
                </span>
              </p>
            )}
          </Kpi>

          <Kpi
            label="Answered by Tina"
            value={`${props.answeredPct}%`}
            detail={props.answeredDetail}
            spark={
              <LumenSparkline
                values={props.answeredSeries}
                labels={dayLabels}
                format="percent"
              />
            }
          >
            <Delta value={props.answeredDelta} label={vsPrevious} unit="pp" />
          </Kpi>

          <Kpi
            label="Needs attention"
            value={props.attentionCount}
            detail={props.attentionDetail}
            chip={props.attentionCount > 0 ? "Open" : undefined}
            accentChip
            spark={
              <LumenSparkline
                values={props.attentionSeries}
                labels={dayLabels}
                tone="accent"
              />
            }
          >
            <Delta value={props.attentionDelta} label={vsPrevious} unit="" />
          </Kpi>

          <Kpi
            label="Knowledge coverage"
            value={`${props.coveragePct}%`}
            detail="of questions covered"
            spark={
              <LumenSparkline
                values={props.coverageSeries}
                labels={dayLabels}
                format="percent"
              />
            }
          >
            <Delta value={props.coverageDelta} label={vsPrevious} unit="pp" />
          </Kpi>
        </section>

        <section className="l-panels">
          <article className="l-card l-panel">
            <div className="l-panel-head">
              <h2>Tina performance over time</h2>
              <p className="l-small l-muted">Share of questions answered by Tina</p>
            </div>
            <div className="l-legend">
              <span>
                <i className="l-key" style={{ background: "var(--l-ink)" }} />
                Answered by Tina
              </span>
              <span>
                <i className="l-key" style={{ background: "var(--l-accent)" }} />
                Needs attention
              </span>
              <span>
                <i className="l-key" style={{ background: "var(--l-soft)" }} />
                Total questions
              </span>
            </div>
            <div className="l-panel-body">
              <LumenPerformanceChart points={props.performancePoints} />
            </div>
          </article>

          <article className="l-card l-panel">
            <div className="l-panel-head">
              <h2>Answer outcomes</h2>
              <p className="l-small l-muted">How questions were handled in this period</p>
            </div>
            <div className="l-panel-body">
              <LumenOutcomeBar
                success={props.outcomes.success}
                gaps={props.outcomes.gaps}
                human={props.outcomes.human}
                errors={props.outcomes.errors}
              />
            </div>
          </article>

          <article className="l-card l-panel">
            <div className="l-panel-head">
              <h2>Top knowledge gaps</h2>
              <p className="l-small l-muted">
                Most common unanswered or low confidence questions
              </p>
            </div>
            {topGaps.length === 0 ? (
              <p className="l-small l-muted" style={{ flex: 1 }}>
                No repeated gaps in this period.
              </p>
            ) : (
              <ol className="l-rank">
                {topGaps.map((gap, index) => (
                  <li key={`${gap.topic}-${index}`}>
                    <Link href="/inbox">
                      <span className="l-rank-num">{index + 1}</span>
                      <span className="l-rank-topic">{gap.topic}</span>
                      <span className="l-small l-muted" style={{ flexShrink: 0 }}>
                        {gap.count} question{gap.count === 1 ? "" : "s"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            <Link className="l-btn secondary compact" href="/inbox">
              View all gaps
            </Link>
          </article>
        </section>

        <section className="l-card l-table-card" aria-label="Needs attention">
          <div className="l-table-head">
            <div>
              <h2 style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.025em" }}>
                Needs attention
              </h2>
              <p className="l-small l-muted">Latest questions that need your review</p>
            </div>
            <Link className="l-btn compact" href="/inbox">
              View all{props.attentionCount > 0 ? ` (${props.attentionCount})` : ""}
            </Link>
          </div>

          {attentionRows.length === 0 ? (
            <p className="l-small l-muted" style={{ padding: "0 28px 28px" }}>
              Nothing waiting in Needs attention.
            </p>
          ) : (
            <table className="l-table">
              <thead>
                <tr>
                  <th style={{ width: "42%" }}>Question</th>
                  <th style={{ width: "16%" }}>Parent</th>
                  <th style={{ width: "12%" }}>Asked</th>
                  <th style={{ width: "16%" }}>Reason</th>
                  <th style={{ width: "14%" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {attentionRows.map((row) => {
                  const reason = attentionReason(row.outcome);
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/chats/${row.session_id}`}>{row.question}</Link>
                      </td>
                      <td className="l-muted">{maskParent(row.wa_from)}</td>
                      <td className="l-muted">{relativeTime(row.created_at)}</td>
                      <td>
                        <span
                          className={`l-chip ${reason.tone === "amber" ? "warn" : "bad"}`}
                        >
                          {reason.label}
                        </span>
                      </td>
                      <td>
                        <Link
                          className="l-btn outline compact"
                          href={`/chats/${row.session_id}`}
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <p className="l-subcopy" style={{ marginInline: "auto" }}>
          Time saved is estimated from grounded Tina answers with no human reply, using the
          minutes-per-question value in Tina config.
        </p>
      </div>
    </div>
  );
}
