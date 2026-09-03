import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PageHeader } from "@/components/app-shell";
import { InboxList } from "@/components/inbox-list";
import type { UnansweredRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error, count } = await supabase
    .from("unanswered_interactions")
    .select("*", { count: "exact" })
    .limit(100);

  const rows = (data || []) as UnansweredRow[];

  // The reply window follows each parent's newest message, not this question's timestamp.
  const numbers = [...new Set(rows.map((row) => row.wa_from).filter(Boolean))] as string[];
  const lastInbound: Record<string, string> = {};
  if (numbers.length > 0) {
    const { data: recent } = await supabase
      .from("interactions")
      .select("wa_from, created_at")
      .in("wa_from", numbers)
      .order("created_at", { ascending: false })
      .limit(1000);
    for (const item of recent || []) {
      const key = item.wa_from as string;
      if (!lastInbound[key]) lastInbound[key] = item.created_at as string;
    }
  }

  return (
    <AppShell email={user.email || ""} unansweredCount={count ?? rows.length}>
      <PageHeader
        title="Needs attention"
        subtitle="Questions Tina could not answer confidently. Reply to the parent on WhatsApp, or turn the answer into knowledge."
      />
      {error ? (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-tis-danger">{error.message}</p>
      ) : (
        <InboxList
          rows={rows}
          userEmail={user.email || ""}
          lastInboundByParent={lastInbound}
        />
      )}
    </AppShell>
  );
}
