import { redirect } from "next/navigation";
import { ChatThreadDetail } from "@/components/chats-workspace";
import { loadChatSessions, loadChatThread } from "@/lib/chats-data";

export const dynamic = "force-dynamic";

export default async function ChatSessionPage({
  params,
}: {
  params: { id: string };
}) {
  const [{ sessions, email }, thread] = await Promise.all([
    loadChatSessions(),
    loadChatThread(params.id),
  ]);
  if (!email) redirect("/login");
  if (!thread.session) redirect("/inbox?notice=unavailable");

  const parentLastMessageAt = sessions
    .filter((row) => row.wa_from === thread.session!.wa_from)
    .reduce<string | null>(
      (latest, row) => (!latest || row.last_message_at > latest ? row.last_message_at : latest),
      null,
    );

  return (
    <ChatThreadDetail
      session={thread.session}
      interactions={thread.messages}
      adminReplies={thread.adminReplies}
      adminNames={thread.adminNames}
      parentStats={thread.parentStats}
      userEmail={email}
      parentLastMessageAt={parentLastMessageAt}
      threadError={thread.threadError}
    />
  );
}
