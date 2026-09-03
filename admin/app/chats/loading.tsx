import { AppShell, PageHeader } from "@/components/app-shell";

export default function ChatsLoading() {
  return (
    <AppShell email="" chatsUnreadCount={0}>
      <PageHeader
        title="Chats"
        subtitle="WhatsApp sessions with Tina. A new session starts after 10 minutes of silence."
      />
      <div className="grid min-h-[78vh] overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-card lg:grid-cols-[300px_1fr]">
        <div className="space-y-3 border-slate-100 p-4 lg:border-r">
          <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="flex gap-3">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-100" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center p-8 text-sm text-tis-muted">
          Loading conversations…
        </div>
      </div>
    </AppShell>
  );
}
