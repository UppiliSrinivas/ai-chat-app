import { create } from 'zustand'
import { getUpload, listUploads, type UploadSummary } from '../api/uploads'

/** Status of the files attached in each chat. Attaching goes through the chat
 *  store, since a file is a message; this only tracks and polls. */
type UploadState = {
  uploadsByChat: Record<string, UploadSummary[]>
  loadUploads: (chatId: string) => Promise<void>
  trackUpload: (chatId: string, upload: UploadSummary) => void
  reset: () => void
}

export const POLL_INTERVAL_MS = 2000

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Reopening a chat reloads its files; this stops it starting a second poller per file.
const activePolls = new Set<string>()

export const useUploadStore = create<UploadState>((set, get) => {
  const uploadsIn = (chatId: string) => get().uploadsByChat[chatId] ?? []

  const setUploads = (chatId: string, uploads: UploadSummary[]) =>
    set({ uploadsByChat: { ...get().uploadsByChat, [chatId]: uploads } })

  const isProcessing = (chatId: string, uploadId: string) =>
    uploadsIn(chatId).some((upload) => upload.id === uploadId && upload.status === 'processing')

  /** Ends once the upload settles, disappears, or the store is reset. */
  const pollUntilSettled = async (chatId: string, uploadId: string) => {
    if (activePolls.has(uploadId)) return
    activePolls.add(uploadId)

    try {
      while (isProcessing(chatId, uploadId)) {
        await wait(POLL_INTERVAL_MS)
        if (!isProcessing(chatId, uploadId)) return

        const latest = await getUpload(uploadId)
        // Gone while the request was in flight: don't bring it back.
        if (!isProcessing(chatId, uploadId)) return
        setUploads(chatId, uploadsIn(chatId).map((upload) => (upload.id === uploadId ? latest : upload)))
      }
    } catch {
      // A failed poll stops quietly; reopening the chat starts a fresh one.
    } finally {
      activePolls.delete(uploadId)
    }
  }

  return {
    uploadsByChat: {},

    // A failed load leaves the cards showing just their names, which is still true.
    loadUploads: async (chatId) => {
      try {
        setUploads(chatId, await listUploads(chatId))
      } catch {
        return
      }
      for (const upload of uploadsIn(chatId)) {
        if (upload.status === 'processing') void pollUntilSettled(chatId, upload.id)
      }
    },

    trackUpload: (chatId, upload) => {
      setUploads(chatId, [...uploadsIn(chatId), upload])
      void pollUntilSettled(chatId, upload.id)
    },

    reset: () => set({ uploadsByChat: {} }),
  }
})
