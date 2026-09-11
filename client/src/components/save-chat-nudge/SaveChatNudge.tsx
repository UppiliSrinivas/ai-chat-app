import { X } from 'lucide-react'

type SaveChatNudgeProps = {
  onSignIn: () => void
  onDismiss: () => void
}

/** Sits directly above the composer, so it reads as part of the chat rather
 *  than as a banner bolted to the top of the page. */
export default function SaveChatNudge({ onSignIn, onDismiss }: SaveChatNudgeProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-3 sm:px-4">
      <div className="flex items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-800 px-3 py-2">
        <p className="min-w-0 flex-1 text-sm text-zinc-300">Sign in to save this chat.</p>

        <button
          type="button"
          onClick={onSignIn}
          className="shrink-0 rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
        >
          Sign in
        </button>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
