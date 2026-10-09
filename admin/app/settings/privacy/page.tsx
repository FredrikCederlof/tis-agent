import { AppShell, PageHeader } from "@/components/app-shell";
import {
  PrivacyPanel,
  type PrivacyDocument,
  type PrivacyEvent,
} from "@/components/privacy-panel";
import { requireAdminPage } from "@/lib/authz";

export default async function PrivacySettingsPage() {
  const { supabase, user, profile } = await requireAdminPage();

  const { data: config } = await supabase
    .from("agent_config")
    .select("retention_days, privacy_contact_email")
    .eq("id", 1)
    .single();

  const days = config?.retention_days ?? 90;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [{ count: sessionsDue }, { count: dedupDue }, { data: events }, { data: documents }, { count }] =
    await Promise.all([
      supabase
        .from("chat_sessions")
        .select("id", { count: "exact", head: true })
        .lt("last_message_at", cutoff),
      supabase
        .from("whatsapp_message_dedup")
        .select("wa_message_id", { count: "exact", head: true })
        .lt("processed_at", cutoff),
      supabase
        .from("privacy_events")
        .select("id, event_type, actor, retention_days, sessions_deleted, dedup_deleted, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("documents")
        .select("id, title, source_type, access_class")
        .order("title"),
      supabase.from("unanswered_interactions").select("id", { count: "exact", head: true }),
    ]);

  return (
    <AppShell email={user.email || ""} unansweredCount={count ?? 0} profile={profile}>
      <PageHeader
        title="Privacy"
        subtitle="Choose how long conversation records are kept, and which documents Tina may use."
      />
      <PrivacyPanel
        actorEmail={user.email || "admin"}
        retentionDays={days}
        contactEmail={config?.privacy_contact_email || ""}
        sessionsDue={sessionsDue ?? 0}
        dedupDue={dedupDue ?? 0}
        events={(events || []) as PrivacyEvent[]}
        documents={(documents || []) as PrivacyDocument[]}
      />
    </AppShell>
  );
}
