import { FileText } from 'lucide-react'
import type { UploadSummary } from '../../api/uploads'
import { describeFailure, formatBytes } from '../../lib/uploadMessages'

export type FileMessageProps = {
  name: string
  /** Absent until the chat's uploads load, so the card shows just the name. */
  upload?: UploadSummary
}

function StatusChip({ upload }: { upload: UploadSummary }) {
  if (upload.status === 'ready') {
    return <span className="text-[11px] text-emerald-400/90">Ready</span>
  }
  if (upload.status === 'failed') {
    return <span className="text-[11px] text-red-400">Failed</span>
  }

  return (
    <span className="flex items-center gap-1.5 text-[11px] text-zinc-400">
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400"
      />
      Processing
    </span>
  )
}

/** A file the user attached, shown where they attached it in the conversation. */
export default function FileMessage({ name, upload }: FileMessageProps) {
  const failureReason = upload?.status === 'failed' ? describeFailure(upload.failureCode) : null

  return (
    <div className="flex justify-end py-2">
      <div
        role="group"
        aria-label={`Attached file ${name}`}
        className="fade-in flex max-w-[min(24rem,85%)] items-start gap-3 rounded-2xl border border-edge bg-glass px-4 py-3 backdrop-blur-md"
      >
        <FileText size={18} className="mt-0.5 shrink-0 text-zinc-400" />
        <div className="min-w-0">
          <p className="truncate text-sm text-zinc-100">{name}</p>
          {upload && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-500">{formatBytes(upload.sizeBytes)}</span>
              <StatusChip upload={upload} />
            </div>
          )}
          {failureReason && <p className="mt-1 text-xs leading-5 text-red-400/90">{failureReason}</p>}
        </div>
      </div>
    </div>
  )
}
