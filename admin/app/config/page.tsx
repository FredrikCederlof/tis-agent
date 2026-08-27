import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ConfigForm } from "@/components/config-form";
import type { AgentConfigRow } from "@/lib/types";

export default async function ConfigPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data, error }, { count }] = await Promise.all([
    supabase.from("agent_config").select("*").eq("id", 1).single(),
    supabase.from("unanswered_interactions").select("id", { count: "exact", head: true }),
  ]);

  if (error || !data) {
    return (
      <AppShell email={user.email || ""} unansweredCount={count ?? 0}>
        <PageHeader title="Tina config" />
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-tis-danger">
          Could not load config: {error?.message}
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell email={user.email || ""} unansweredCount={count ?? 0}>
      <PageHeader
        title="Tina config"
        subtitle="Edit how Tina behaves on WhatsApp. Changes apply within about a minute."
      />
      <ConfigForm config={data as AgentConfigRow} userEmail={user.email || ""} />
    </AppShell>
  );
}
