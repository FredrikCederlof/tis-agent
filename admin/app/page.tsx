import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { OutcomeDonut, PerformanceChart } from "@/components/charts";
import { RefreshButton } from "@/components/refresh-button";
import { DashboardDateRange } from "@/components/dashboard-date-range";
import {
  KnowledgeHubCard,
  NeedsAttentionPanel,
  RecentConversationsPanel,
  TopQuestionsCard,
} from "@/components/dashboard-panels";
import {
  KPI_DEFINITIONS,
  buildDashboardModel,
  fetchSinceIso,
  fetchUntilIso,
  formatChartDayLabel,
  percentagePointChange,
  resolveDateRange,
  type InteractionRow,
} from "@/lib/dashboard";
import {
  clampMinutesPerQuestion,
  formatSavedTime,
  formatSavedTimeDelta,
  timeSavedMinutes,
} from "@/lib/time-saved";
import { displayFirstName } from "@/lib/account";
import { ensureAdminProfile } from "@/lib/ensure-profile";
import { TOKYO } from "@/lib/tokyo-weeks";
import type { ChatSessionRow } from "@/lib/chats";

export const dynamic = "force-dynamic";

function greetingForNow(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TOKYO,
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await ensureAdminProfile(supabase, user);
  const firstName = displayFirstName(profile);

  const { from, to } = resolveDateRange(searchParams?.from, searchParams?.to);
  const since = fetchSinceIso(from, to);
  const until = fetchUntilIso(to);

  const [
    { data: interactions, error: interactionsError },
    unansweredRes,
    configRes,
    sessionsRes,
  ] = await Promise.all([
    supabase
      .from("interactions")
      .select("created_at, outcome, question, human_replied_at")
      .gte("created_at", since)
      .lte("created_at", until)
      .limit(10000),
    supabase
      .from("unanswered_interactions")
      .select("id, session_id, question, outcome, created_at, wa_from", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("agent_config").select("minutes_saved_per_question").eq("id", 1).maybeSingle(),
    supabase
      .from("admin_session_list")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(5),
  ]);

  const minutesPerQuestion = clampMinutesPerQuestion(
    configRes.data?.minutes_saved_per_question,
  );
  const dash = buildDashboardModel((interactions || []) as InteractionRow[], from, to);
  const { current, previous, days, weeks, dayCount, topQuestions } = dash;
  const unansweredCount = unansweredRes.count ?? 0;
  const currentSaved = timeSavedMinutes(current.tinaHandledCount, minutesPerQuestion);
  const previousSaved = timeSavedMinutes(previous.tinaHandledCount, minutesPerQuestion);
  const periodNoun = dayCount === 1 ? "day" : "days";
  const weekCount = weeks.length;
  const humanSlice = current.fixedCount;
  const attentionShare =
    current.questions > 0
      ? Math.round((unansweredCount / Math.max(current.questions, 1)) * 1000) / 10
      : 0;
  const dayLabels = days.map((d) => d.label);
  const chartRangeLabel =
    weekCount === 1 ? "1 week" : `${weekCount} weeks (${dayCount} ${periodNoun})`;
  const vsPrevious = `vs previous ${dayCount} ${periodNoun}`;
  const attentionDelta = current.gapCount - previous.gapCount;
  const useDailyBars = dayCount <= 14;
  const performancePoints = useDailyBars
    ? days.map((d) => ({
        label: formatChartDayLabel(d.key),
        answered: d.success,
        unanswered: Math.max(0, d.questions - d.success),
      }))
    : weeks.map((w) => ({
        label: w.label,
        answered: w.success,
        unanswered: Math.max(0, w.questions - w.success),
      }));
  const recentSessions = (sessionsRes.data || []) as ChatSessionRow[];
  const greeting = greetingForNow();

  return (
    <AppShell
      email={user.email || ""}
      unansweredCount={unansweredCount}
      profile={profile}
    >
      <div className="min-w-0 pb-24">
        <div className="mb-6 grid gap-4 sm:mb-8 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <h1 className="page-title">
              {greeting}, {firstName}{" "}
              <span aria-hidden className="font-normal">
                👋
              </span>
            </h1>
            <p className="page-subtitle">Here&apos;s what&apos;s happening with Tina today.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <DashboardDateRange from={from} to={to} />
            <RefreshButton />
          </div>
        </div>

        {interactionsError ? (
          <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-tis-danger">
            Could not load dashboard interactions: {interactionsError.message}
          </p>
        ) : null}

        <div className="relative z-10 grid min-w-0 gap-4 overflow-visible sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total questions asked"
            value={current.questions}
            definition={KPI_DEFINITIONS.totalQuestions}
            accent="purple"
            iconName="message"
            sparkline={days.map((d) => d.questions)}
            sparklineLabels={dayLabels}
            sparkFormat="number"
            delta={current.questions - previous.questions}
            deltaLabel={vsPrevious}
            deltaUnit=""
          />
          <StatCard
            label="Needs attention"
            value={unansweredCount}
            detail={current.questions > 0 ? `${attentionShare}% of questions` : "Open queue"}
            definition={KPI_DEFINITIONS.needsAttention}
            accent="amber"
            sparkline={days.map((d) => d.gaps)}
            sparklineLabels={dayLabels}
            delta={attentionDelta}
            deltaLabel={vsPrevious}
            deltaUnit=""
          />
          <StatCard
            label="Knowledge coverage"
            value={`${current.knowledgeCoveragePct}%`}
            detail="of questions covered"
            definition={KPI_DEFINITIONS.knowledgeCoverage}
            accent="blue"
            sparkline={days.map((d) =>
              d.questions > 0 ? Math.round((d.success / d.questions) * 100) : 0,
            )}
            sparklineLabels={dayLabels}
            sparkFormat="percent"
            delta={percentagePointChange(
              current.knowledgeCoveragePct,
              previous.knowledgeCoveragePct,
            )}
            deltaLabel={vsPrevious}
            deltaUnit=" percentage points"
          />
          <StatCard
            label="Time saved"
            value={formatSavedTime(currentSaved)}
            iconName="clock"
            definition={KPI_DEFINITIONS.timeSaved}
            accent="green"
            sparkline={days.map((d) => timeSavedMinutes(d.tinaHandled, minutesPerQuestion))}
            sparklineLabels={dayLabels}
            sparkFormat="duration"
            deltaFormatted={formatSavedTimeDelta(currentSaved, previousSaved)}
            deltaLabel={vsPrevious}
            tipAlign="end"
          />
        </div>

        <div className="mt-6 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="card flex min-h-[320px] min-w-0 flex-col">
            <div className="min-h-0 flex-1">
              <PerformanceChart points={performancePoints} rangeLabel={chartRangeLabel} />
            </div>
          </section>

          <section className="card flex min-h-[320px] min-w-0 flex-col">
            <div className="min-h-0 flex-1">
              <OutcomeDonut
                success={current.successCount}
                gaps={current.gapCount}
                human={humanSlice}
                errors={current.errorCount}
              />
            </div>
          </section>
        </div>

        <div className="mt-6 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
          <NeedsAttentionPanel
            rows={(unansweredRes.data || []) as {
              id: string;
              session_id: string;
              question: string;
              outcome: string;
              created_at: string;
              wa_from?: string | null;
            }[]}
            total={unansweredCount}
          />
          <RecentConversationsPanel sessions={recentSessions} />
          <div className="flex min-w-0 flex-col gap-4">
            <TopQuestionsCard questions={topQuestions} />
            <KnowledgeHubCard suggestedCount={unansweredCount} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
