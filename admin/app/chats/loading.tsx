/** Initial /chats load only — avoid remounting the whole shell on every selection. */
export default function ChatsLoading() {
  return (
    <div className="flex min-h-[420px] items-center justify-center text-sm text-tis-muted">
      Loading conversations…
    </div>
  );
}
