import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { formatTokens } from '../../lib/formatTokens'

type ComposerProps = {
  onSend: (message: string) => void | Promise<void>
  isStreaming?: boolean
  onStop?: () => void
  disabled?: boolean
  placeholder?: string
  autoFocus?: boolean
  /** Tokens stored in this chat so far. Omitted on a chat with no messages. */
  tokenCount?: number
}

const MAX_TEXTAREA_HEIGHT_PX = 200

function resizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`
}

export default function Composer({
  onSend,
  isStreaming = false,
  onStop,
  disabled = false,
  placeholder = 'Ask...',
  autoFocus = false,
  tokenCount = 0,
}: ComposerProps) {
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // A fresh chat has nothing to report, and "0 tokens" reads as broken.
  const usageNotice = tokenCount > 0 ? ` - ${formatTokens(tokenCount)} tokens` : ''

  const trimmedDraft = draft.trim()
  const canSend = trimmedDraft.length > 0 && !disabled && !isStreaming

  const sendDraft = () => {
    if (!canSend) return
    onSend(trimmedDraft)
    setDraft('')
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }
    event.preventDefault()
    sendDraft()
  }

  const handleActionClick = () => {
    if (isStreaming) {
      onStop?.()
      return
    }
    sendDraft()
  }

  return (
    <div className="w-full px-3 py-3 sm:px-4 sm:py-4">
      {/* Lives with the composer so it cannot drift away from the input it
          qualifies. The build number is in the sidebar footer instead. */}
      <p className="pb-2 text-center text-xs text-zinc-500">
        AI-Chat-App can make mistakes{usageNotice}
      </p>
      <div className="mx-auto flex w-full max-w-3xl items-end gap-1.5 rounded-3xl border border-zinc-700 bg-zinc-800 p-2 focus-within:border-zinc-500 sm:gap-2 sm:p-2.5">
        <textarea
          ref={textareaRef}
          autoFocus={autoFocus}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            resizeTextarea(event.target)
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="max-h-[200px] flex-1 resize-none bg-transparent px-5 text-[15px] leading-6 text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50"
        />

        <button
          type="button"
          onClick={handleActionClick}
          disabled={!isStreaming && !canSend}
          aria-label={isStreaming ? 'Stop generating' : 'Send message'}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 transition-opacity disabled:opacity-30"
        >
          {isStreaming ? <Square size={12} fill="currentColor" /> : <ArrowUp size={18} />}
        </button>
      </div>
    </div>
  )
}
