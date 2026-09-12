import { useState } from 'react'
import { Check, Copy, Share2, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import MarkdownContent from './MarkdownContent'
import type { ToolActivity } from '../../api/streamChat'

export type AssistantMessageProps = {
  content: string
  isStreaming?: boolean
  tools?: ToolActivity[]
  onFeedback?: (feedback: 'up' | 'down') => void
  onShare?: (content: string) => void
}

const COPIED_RESET_DELAY_MS = 1500

function ToolStatusIcon({ status }: { status: ToolActivity['status'] }) {
  if (status === 'done') return <Check size={13} className="shrink-0 text-zinc-500" />
  if (status === 'failed') return <X size={13} className="shrink-0 text-red-400" />

  return (
    <span
      aria-hidden="true"
      className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400"
    />
  )
}

/** What the model is doing before it can answer. Announced politely so a screen
 *  reader hears the step without it interrupting the reply. */
function ToolActivityList({ tools }: { tools: ToolActivity[] }) {
  return (
    <ul role="status" aria-live="polite" className="flex flex-col gap-1.5 py-1">
      {tools.map((tool) => (
        <li key={tool.id} className="flex items-center gap-2 text-[13px] leading-5 text-zinc-400">
          <ToolStatusIcon status={tool.status} />
          <span>{tool.label}</span>
        </li>
      ))}
    </ul>
  )
}

export default function AssistantMessage({
  content,
  isStreaming = false,
  tools = [],
  onFeedback,
  onShare,
}: AssistantMessageProps) {
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), COPIED_RESET_DELAY_MS)
  }

  const handleFeedback = (next: 'up' | 'down') => {
    const resolved = feedback === next ? null : next
    setFeedback(resolved)
    if (resolved) onFeedback?.(resolved)
  }

  const isWaitingForFirstToken = isStreaming && content.length === 0
  // Tool lines already say something is happening, so the dots would only
  // repeat it.
  const isShowingTypingDots = isWaitingForFirstToken && tools.length === 0

  return (
    <div
      className="flex max-w-2xl flex-col gap-1.5"
    >
      {tools.length > 0 && <ToolActivityList tools={tools} />}

      {isShowingTypingDots && (
        <div className="flex items-center gap-1 py-1.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500" />
        </div>
      )}

      {!isWaitingForFirstToken && (
        <div className="flex flex-wrap items-end">
          <MarkdownContent content={content} />
          {isStreaming && (
            <span className="mb-1 ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-zinc-300" />
          )}
        </div>
      )}

      {!isStreaming && (
        <div
          className={`flex items-center gap-1 transition-opacity opacity-100`}
        >
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy response"
            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button
            type="button"
            onClick={() => handleFeedback('up')}
            aria-label="Good response"
            aria-pressed={feedback === 'up'}
            className={`flex h-7 w-7 items-center justify-center rounded-full hover:bg-zinc-800 ${feedback === 'up' ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'
              }`}
          >
            <ThumbsUp size={15} />
          </button>
          <button
            type="button"
            onClick={() => handleFeedback('down')}
            aria-label="Bad response"
            aria-pressed={feedback === 'down'}
            className={`flex h-7 w-7 items-center justify-center rounded-full hover:bg-zinc-800 ${feedback === 'down' ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'
              }`}
          >
            <ThumbsDown size={15} />
          </button>
          <button
            type="button"
            onClick={() => onShare?.(content)}
            aria-label="Share response"
            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <Share2 size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
