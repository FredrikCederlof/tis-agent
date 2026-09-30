import { redirect } from "next/navigation";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ChatsWorkspaceBridge } from "@/components/chats-workspace-bridge";
import { loadChatSessions } from "@/lib/chats-data";

export const dynamic = "force-dynamic";

/**
 * Persistent chats shell: session list stays mounted while only the detail
 * pane (`children`) remounts on conversation switches (INS-21).
 */
export default async function ChatsLayout({ children }: { children: React.ReactNode }) {
  const { sessions, unanswered, unread, error, email } = await loadChatSessions();
  if (!email) redirect("/login");

  return (
    <AppShell email={email} unansweredCount={unanswered} chatsUnreadCount={unread}>
      <PageHeader
        title="Chats"
        subtitle="WhatsApp sessions with Tina. A new session starts after 10 minutes of silence."
      />
      <ChatsWorkspaceBridge sessions={sessions} loadError={error} userEmail={email}>
        {children}
      </ChatsWorkspaceBridge>
    </AppShell>
  );
}
