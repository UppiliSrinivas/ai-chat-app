import { apiFetch } from './client'

export type UploadFailureCode =
  | 'UNREADABLE_FILE'
  | 'EMPTY_TEXT'
  | 'TOO_MANY_CHUNKS'
  | 'EMBEDDING_FAILED'
  | 'STORAGE_FAILED'
  | 'INTERRUPTED'

type UploadBase = {
  id: string
  name: string
  sizeBytes: number
  createdAt: string
}

/** Only a failed upload carries a reason, only a ready one a chunk count. */
export type UploadSummary = UploadBase &
  (
    | { status: 'processing' }
    | { status: 'ready'; chunkCount: number }
    | { status: 'failed'; failureCode: UploadFailureCode }
  )

/** The server's flat shape stops here. */
type WireUpload = UploadBase & {
  status: UploadSummary['status']
  chunkCount: number
  failureCode: UploadFailureCode | null
}

export const toUploadSummary = ({ status, chunkCount, failureCode, ...base }: WireUpload): UploadSummary => {
  if (status === 'ready') return { ...base, status, chunkCount }
  if (status === 'failed') return { ...base, status, failureCode: failureCode ?? 'INTERRUPTED' }
  return { ...base, status }
}

export async function listUploads(chatId: string): Promise<UploadSummary[]> {
  const uploads = await apiFetch<WireUpload[]>(`/uploads?chatId=${encodeURIComponent(chatId)}`)
  return uploads.map(toUploadSummary)
}

export async function getUpload(id: string): Promise<UploadSummary> {
  return toUploadSummary(await apiFetch<WireUpload>(`/uploads/${id}`))
}

export async function uploadFile(chatId: string, file: File): Promise<UploadSummary> {
  const form = new FormData()
  form.append('chatId', chatId)
  form.append('file', file)
  return toUploadSummary(await apiFetch<WireUpload>('/uploads', { method: 'POST', body: form }))
}
