import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UploadSummary } from '../api/uploads'

const api = vi.hoisted(() => ({
  listUploads: vi.fn(),
  getUpload: vi.fn(),
}))

vi.mock('../api/uploads', () => api)

const { POLL_INTERVAL_MS, useUploadStore } = await import('./useUploadStore')

const base = { name: 'notes.pdf', sizeBytes: 1024, createdAt: '2026-10-10' }
const processing = (id = 'u1'): UploadSummary => ({ ...base, id, status: 'processing' })
const ready = (id = 'u1'): UploadSummary => ({ ...base, id, status: 'ready', chunkCount: 4 })

const uploadsOf = (chatId = 'c1') => useUploadStore.getState().uploadsByChat[chatId] ?? []
const initial = useUploadStore.getState()

beforeEach(() => {
  vi.useFakeTimers()
  useUploadStore.setState(initial, true)
  api.listUploads.mockReset().mockResolvedValue([])
  api.getUpload.mockReset().mockResolvedValue(ready())
})

afterEach(async () => {
  // Settles any poller still waiting, so one test's loop can't leak into the next.
  useUploadStore.getState().reset()
  await vi.runOnlyPendingTimersAsync()
  vi.useRealTimers()
})

describe('loadUploads', () => {
  it("stores a chat's uploads", async () => {
    api.listUploads.mockResolvedValue([ready()])

    await useUploadStore.getState().loadUploads('c1')

    expect(uploadsOf()).toEqual([ready()])
    expect(api.listUploads).toHaveBeenCalledWith('c1')
  })

  // The file cards still show their names, so a failed load isn't worth an error.
  it('keeps what it had when the load fails', async () => {
    useUploadStore.setState({ uploadsByChat: { c1: [ready()] } })
    api.listUploads.mockRejectedValue(new Error('Network down'))

    await useUploadStore.getState().loadUploads('c1')

    expect(uploadsOf()).toEqual([ready()])
  })

  // A file still processing from before a reload should keep updating.
  it('resumes polling uploads that are still processing', async () => {
    api.listUploads.mockResolvedValue([processing()])

    await useUploadStore.getState().loadUploads('c1')
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)

    expect(uploadsOf()[0].status).toBe('ready')
  })

  it('does not start a second poller when the chat is loaded again', async () => {
    api.listUploads.mockResolvedValue([processing()])
    api.getUpload.mockResolvedValue(processing())

    await useUploadStore.getState().loadUploads('c1')
    await useUploadStore.getState().loadUploads('c1')
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)

    expect(api.getUpload).toHaveBeenCalledTimes(1)
  })
})

describe('trackUpload', () => {
  it('adds the upload and polls until it is ready, then stops', async () => {
    api.getUpload.mockResolvedValueOnce(processing()).mockResolvedValueOnce(ready())

    useUploadStore.getState().trackUpload('c1', processing())
    expect(uploadsOf()[0].status).toBe('processing')

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2)
    expect(uploadsOf()[0].status).toBe('ready')

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3)
    expect(api.getUpload).toHaveBeenCalledTimes(2)
  })

  it('does not poll an upload that is already settled', async () => {
    useUploadStore.getState().trackUpload('c1', ready())
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2)

    expect(api.getUpload).not.toHaveBeenCalled()
  })

  it('stops polling quietly when a poll fails', async () => {
    api.getUpload.mockRejectedValue(new Error('offline'))

    useUploadStore.getState().trackUpload('c1', processing())
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3)

    expect(api.getUpload).toHaveBeenCalledTimes(1)
  })

  // Signing out mid-upload must not let a late poll write the old user's file back.
  it('stops polling after a reset', async () => {
    useUploadStore.getState().trackUpload('c1', processing())
    useUploadStore.getState().reset()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2)

    expect(api.getUpload).not.toHaveBeenCalled()
    expect(uploadsOf()).toEqual([])
  })
})
