"use client";

import { usePathname } from "next/navigation";
import { ChatsWorkspace } from "@/components/chats-workspace";
import type { ChatSessionRow } from "@/lib/chats";

/** Keeps the conversation list mounted; selectedId follows the URL. */
export function ChatsWorkspaceBridge({
  sessions,
  userEmail,
  loadError,
  children,
}: {
  sessions: ChatSessionRow[];
  userEmail: string;
  loadError?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";
  const match = pathname.match(/^\/chats\/([^/]+)/);
  const selectedId = match?.[1];

  return (
    <ChatsWorkspace
      sessions={sessions}
      selectedId={selectedId}
      userEmail={userEmail}
      loadError={loadError}
    >
      {children}
    </ChatsWorkspace>
  );
}
