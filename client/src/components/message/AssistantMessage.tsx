import { useState } from 'react'
import { Check, Copy, Share2, ThumbsDown, ThumbsUp } from 'lucide-react'
import MarkdownContent from './MarkdownContent'

export type AssistantMessageProps = {
  content: string
  isStreaming?: boolean
  onFeedback?: (feedback: 'up' | 'down') => void
  onShare?: (content: string) => void
}

const COPIED_RESET_DELAY_MS = 1500

export default function AssistantMessage({
  content,
  isStreaming = false,
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

  return (
    <div
      className="flex max-w-2xl flex-col gap-1.5"
    >
      {isWaitingForFirstToken ? (
        <div className="flex items-center gap-1 py-1.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500" />
        </div>
      ) : (
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
