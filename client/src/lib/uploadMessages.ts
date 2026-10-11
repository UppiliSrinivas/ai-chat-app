import type { UploadFailureCode } from '../api/uploads'
import { MAX_UPLOAD_BYTES } from './limits'

/** Plain-language reasons for a failed upload, written for the user, not the log. */
const FAILURE_MESSAGES: Record<UploadFailureCode, string> = {
  UNREADABLE_FILE: "This file couldn't be opened. It may be damaged or password-protected.",
  EMPTY_TEXT: 'No text was found. Scanned PDFs need text recognition first.',
  TOO_MANY_CHUNKS: 'This file is too long to search. Try splitting it into parts.',
  EMBEDDING_FAILED: "This file couldn't be indexed right now. Delete it and try again.",
  STORAGE_FAILED: "This file couldn't be saved. Delete it and try again.",
  INTERRUPTED: 'Processing was interrupted. Delete it and try again.',
}

export const describeFailure = (code: UploadFailureCode): string => FAILURE_MESSAGES[code]

const KILOBYTE = 1024
const MEGABYTE = KILOBYTE * 1024

export const formatBytes = (bytes: number): string => {
  if (bytes < KILOBYTE) return `${bytes} B`
  if (bytes < MEGABYTE) return `${Math.round(bytes / KILOBYTE)} KB`
  return `${(bytes / MEGABYTE).toFixed(1)} MB`
}

/** The same picker filter and size check the server enforces, run before uploading. */
export const ACCEPTED_FILE_TYPES = '.pdf,.txt,.md,.markdown'

export const checkFileSize = (file: File): string | null => {
  if (file.size <= MAX_UPLOAD_BYTES) return null
  return `"${file.name}" is ${formatBytes(file.size)}. Files can be up to ${formatBytes(MAX_UPLOAD_BYTES)}.`
}
