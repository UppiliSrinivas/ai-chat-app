/**
 * A chat that has been started inside a project but not sent yet — the server
 * only creates it on the first message. Without this row the click that
 * started it looks like it did nothing.
 */
export default function PendingChatRow() {
  return (
    <div className="fade-in flex items-center gap-2 rounded-lg bg-zinc-800/40 px-3 py-2 text-sm text-zinc-500 italic">
      <span className="truncate">New chat…</span>
    </div>
  )
}
