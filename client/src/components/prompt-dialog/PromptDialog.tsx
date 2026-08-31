import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type PromptDialogProps = {
  isOpen: boolean
  title: string
  label: string
  description?: string
  placeholder?: string
  initialValue?: string
  submitLabel?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

export default function PromptDialog({
  isOpen,
  title,
  label,
  description,
  placeholder,
  initialValue = '',
  submitLabel = 'Create',
  onSubmit,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const inputId = useId()

  // Reopening starts fresh: whatever was typed and abandoned last time is not
  // an answer to this time's question.
  useEffect(() => {
    if (!isOpen) return
    setValue(initialValue)
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [isOpen, initialValue])

  useEffect(() => {
    if (!isOpen) return

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const trimmed = value.trim()

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  // Portalled for the same reason as ConfirmDialog: `position: fixed` resolves
  // against the sidebar's transform rather than the viewport.
  return createPortal(
    <>
      <div onClick={onCancel} className="dialog-backdrop fixed inset-0 z-[60] bg-black/70" aria-hidden="true" />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={handleSubmit}
        className="dialog-panel fixed top-1/2 left-1/2 z-[70] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/50"
      >
        <h2 id={titleId} className="text-base font-medium text-zinc-100">
          {title}
        </h2>

        <label htmlFor={inputId} className="mt-4 block text-xs font-medium text-zinc-400">
          {label}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          maxLength={200}
          className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 transition-colors placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
        />
        {description && <p className="mt-2 text-xs leading-5 text-zinc-500">{description}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!trimmed}
            className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </>,
    document.body,
  )
}
