import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export type ConfirmDialogProps = {
  isOpen: boolean
  title: string
  body: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  isOpen,
  title,
  body,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus lands on cancel, not confirm — destroying something should take a
  // deliberate move, never a stray Enter press.
  useEffect(() => {
    if (isOpen) cancelRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  // Portalled to body because `position: fixed` resolves against the nearest
  // transformed ancestor, not the viewport — and the sidebar this opens from
  // always carries a translate class, which would trap the dialog inside it.
  return createPortal(
    <>
      <div onClick={onCancel} className="fixed inset-0 z-[60] bg-black/70" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="fixed top-1/2 left-1/2 z-[70] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
      >
        <h2 id="confirm-dialog-title" className="text-base font-medium text-zinc-100">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
