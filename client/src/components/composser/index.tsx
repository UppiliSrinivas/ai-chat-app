import { useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { ArrowUp, Paperclip, Square } from 'lucide-react'
import { formatTokens } from '../../lib/formatTokens'
import { ACCEPTED_FILE_TYPES } from '../../lib/uploadMessages'

type ComposerProps = {
  onSend: (message: string) => void | Promise<void>
  isStreaming?: boolean
  onStop?: () => void
  disabled?: boolean
  placeholder?: string
  autoFocus?: boolean
  /** Tokens stored in this chat so far. Omitted on a chat with no messages. */
  tokenCount?: number
  /** Attaches a file to this chat. Omitted, the attach button is hidden. */
  onAttachFile?: (file: File) => void
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
  onAttachFile,
}: ComposerProps) {
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // A fresh chat has nothing to count, and "0 tokens" reads as broken.
  const usageLabel = tokenCount > 0 ? `${formatTokens(tokenCount)} tokens` : ''

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

  const handleFileChosen = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Cleared so choosing the same file again still fires a change.
    event.target.value = ''
    if (file) onAttachFile?.(file)
  }

  const handleActionClick = () => {
    if (isStreaming) {
      onStop?.()
      return
    }
    sendDraft()
  }

  return (
    <div className="w-full px-3 pt-3 pb-2 sm:px-4 sm:pt-4">

      {/* Frosted rather than solid: the two hazes behind it in the chat page are
          what backdrop-blur samples, so this needs them to read as glass. */}
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-3xl border border-edge bg-glass p-3 backdrop-blur-xl backdrop-saturate-150 transition-colors focus-within:border-edge/80 sm:gap-3 sm:p-4">
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
          className="max-h-[200px] w-full resize-none bg-transparent px-1 text-base leading-6 text-zinc-100 placeholder:text-zinc-400/70 focus:outline-none disabled:opacity-50"
        />

        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {onAttachFile && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  onChange={handleFileChosen}
                  className="hidden"
                  aria-label="Choose a file to attach"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled || isStreaming}
                  aria-label="Attach file"
                  title="Attach a PDF, .txt or .md file (up to 4 MB)"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-zinc-100 disabled:opacity-30"
                >
                  <Paperclip size={16} />
                </button>
              </>
            )}
            <span className="px-1 text-xs text-zinc-400/70 tabular-nums">{usageLabel}</span>
          </div>

          <button
            type="button"
            onClick={handleActionClick}
            disabled={!isStreaming && !canSend}
            aria-label={isStreaming ? 'Stop generating' : 'Send message'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 transition-opacity hover:bg-white disabled:opacity-30"
          >
            {isStreaming ? <Square size={12} fill="currentColor" /> : <ArrowUp size={18} />}
          </button>
        </div>
      </div>

      {/* Lives with the composer so it cannot drift away from the input it
          qualifies. The build number is in the sidebar footer instead. */}
      <p className="pt-2 text-center text-xs text-zinc-500">AI-Chat-App can make mistakes</p>
    </div>
  )
}
