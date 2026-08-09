import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Check, ChevronLeft, ChevronRight, Copy, Pencil } from 'lucide-react'
import { MAX_EDITS_PER_MESSAGE } from '../../hooks/useChatStore'

export type UserMessageProps = {
  content: string
  editIndex: number
  editCount: number
  onNavigateEdit: (direction: 'prev' | 'next') => void
  onEdit: (newContent: string) => void
}

const COPIED_RESET_DELAY_MS = 1500

export default function UserMessage({
  content,
  editIndex,
  editCount,
  onNavigateEdit,
  onEdit,
}: UserMessageProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(content)
  const [copied, setCopied] = useState(false)

  const isEditLimitReached = editCount > MAX_EDITS_PER_MESSAGE

  const startEditing = () => {
    if (isEditLimitReached) return
    setDraft(content)
    setIsEditing(true)
  }

  const saveEdit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== content) {
      onEdit(trimmed)
    }
    setIsEditing(false)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), COPIED_RESET_DELAY_MS)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      saveEdit()
    } else if (event.key === 'Escape') {
      setIsEditing(false)
    }
  }

  return (
    <div className={`group flex flex-col items-end gap-1.5 ${isEditing ? 'w-full' : 'max-w-lg'}`}>
      {isEditing ? (
        <div className="w-full rounded-3xl bg-zinc-800 p-4">
          <textarea
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={Math.min(8, draft.split('\n').length)}
            className="w-full resize-none bg-transparent text-[15px] leading-6 text-zinc-100 focus:outline-none"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-full bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-zinc-800 px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap text-zinc-100">
          {content}
        </div>
      )}

      <div className="flex items-center gap-1 text-xs text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100">
        {!isEditing && (
          <>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy message"
              className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-zinc-700"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <button
              type="button"
              onClick={startEditing}
              disabled={isEditLimitReached}
              aria-label={isEditLimitReached ? 'Edit limit reached' : 'Edit message'}
              title={isEditLimitReached ? `Limit of ${MAX_EDITS_PER_MESSAGE} edits reached` : undefined}
              className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Pencil size={13} />
            </button>
          </>
        )}
        {editCount > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onNavigateEdit('prev')}
              disabled={editIndex <= 1}
              aria-label="Previous edit"
              className="flex h-6 w-6 items-center justify-center rounded-full disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span>
              {editIndex}/{editCount}
            </span>
            <button
              type="button"
              onClick={() => onNavigateEdit('next')}
              disabled={editIndex >= editCount}
              aria-label="Next edit"
              className="flex h-6 w-6 items-center justify-center rounded-full disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
