import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('./client', () => ({ apiFetch }))

const { getUpload, listUploads, toUploadSummary, uploadFile } = await import('./uploads')

const wire = {
  id: 'u1',
  name: 'notes.pdf',
  sizeBytes: 1024,
  createdAt: '2026-10-10',
  status: 'processing' as const,
  chunkCount: 0,
  failureCode: null,
}

beforeEach(() => {
  apiFetch.mockReset().mockResolvedValue(wire)
})

describe('toUploadSummary', () => {
  it('keeps only the fields a processing upload has', () => {
    expect(toUploadSummary(wire)).toEqual({
      id: 'u1',
      name: 'notes.pdf',
      sizeBytes: 1024,
      createdAt: '2026-10-10',
      status: 'processing',
    })
  })

  it('carries the chunk count on a ready upload', () => {
    expect(toUploadSummary({ ...wire, status: 'ready', chunkCount: 12 })).toMatchObject({
      status: 'ready',
      chunkCount: 12,
    })
  })

  it('carries the reason on a failed upload', () => {
    expect(toUploadSummary({ ...wire, status: 'failed', failureCode: 'EMPTY_TEXT' })).toMatchObject({
      status: 'failed',
      failureCode: 'EMPTY_TEXT',
    })
  })

  // A failed upload must always have a reason to show.
  it('falls back to a reason when the server sent none', () => {
    expect(toUploadSummary({ ...wire, status: 'failed' })).toMatchObject({ failureCode: 'INTERRUPTED' })
  })
})

describe('requests', () => {
  it("lists a chat's uploads", async () => {
    apiFetch.mockResolvedValue([wire])

    expect(await listUploads('c 1')).toHaveLength(1)
    expect(apiFetch).toHaveBeenCalledWith('/uploads?chatId=c%201')
  })

  it('fetches one upload by id', async () => {
    await getUpload('u1')

    expect(apiFetch).toHaveBeenCalledWith('/uploads/u1')
  })

  it('posts the file and its chat as multipart form data', async () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })

    await uploadFile('c1', file)

    const [path, init] = apiFetch.mock.calls[0] as [string, RequestInit]
    const form = init.body as FormData
    expect(path).toBe('/uploads')
    expect(init.method).toBe('POST')
    expect(form.get('chatId')).toBe('c1')
    expect(form.get('file')).toBeInstanceOf(File)
  })
})
