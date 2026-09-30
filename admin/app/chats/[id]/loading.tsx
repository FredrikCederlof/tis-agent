/** Detail-only loading — conversation list stays visible in the layout. */
export default function ChatDetailLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <div className="h-10 w-10 animate-pulse rounded-full bg-slate-100" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-tis-muted">
        Loading conversation…
      </div>
    </div>
  );
}
