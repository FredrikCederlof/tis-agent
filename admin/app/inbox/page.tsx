import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PageHeader } from "@/components/app-shell";
import { InboxList } from "@/components/inbox-list";
import type { UnansweredRow } from "@/lib/types";

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

  return (
    <AppShell email={user.email || ""} unansweredCount={count ?? data?.length ?? 0}>
      <PageHeader
        title="Unanswered questions"
        subtitle="Questions Tina could not answer confidently from official TIS sources."
      />
      {error ? (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-tis-danger">{error.message}</p>
      ) : (
        <InboxList rows={(data || []) as UnansweredRow[]} userEmail={user.email || ""} />
      )}
    </AppShell>
  );
}
