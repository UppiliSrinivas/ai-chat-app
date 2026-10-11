import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))

vi.mock('./client', () => ({ apiFetch }))

const { createChat, deleteChat, getChat, listChats, toChatMessage } = await import('./chats')

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue(undefined)
})

describe('chats api', () => {
  // POST with an empty object rather than no body: the server's json parser
  // leaves req.body undefined otherwise, which its validation rejects.
  it('creates a standalone chat with an empty JSON body', async () => {
    await createChat()

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/chats', { method: 'POST', body: '{}' })
  })

  it('creates a chat inside a project', async () => {
    await createChat('p1')

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/chats', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'p1' }),
    })
  })

  it('lists chats with a plain GET', async () => {
    await listChats()

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/chats')
  })

  it('fetches one chat by id', async () => {
    apiFetch.mockResolvedValue({ id: 'abc123', messages: [] })

    await getChat('abc123')

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/chats/abc123')
  })

  it('deletes a chat by id', async () => {
    await deleteChat('abc123')

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/chats/abc123', { method: 'DELETE' })
  })

  it('returns whatever the server sent back', async () => {
    const chats = [{ id: 'a', title: 'First', updatedAt: '2026-01-01' }]
    apiFetch.mockResolvedValue(chats)

    await expect(listChats()).resolves.toEqual(chats)
  })

  // Errors are apiFetch's job to shape; these wrappers must not swallow them
  // or the store loses the server's message.
  it('lets a failure propagate', async () => {
    apiFetch.mockRejectedValue(new Error('Chat not found.'))

    await expect(getChat('missing')).rejects.toThrow('Chat not found.')
  })
})

describe('toChatMessage', () => {
  it('reads a plain message as text', () => {
    expect(toChatMessage({ role: 'assistant', kind: 'text', content: 'Hi', uploadId: null })).toEqual({
      kind: 'text',
      role: 'assistant',
      content: 'Hi',
    })
  })

  // Messages stored before files existed carry no kind at all.
  it('reads a message with no kind as text', () => {
    expect(toChatMessage({ role: 'user', content: 'Hi' })).toMatchObject({ kind: 'text' })
  })

  it('reads a file message as its upload and name', () => {
    expect(toChatMessage({ role: 'user', kind: 'file', content: 'cv.pdf', uploadId: 'u1' })).toEqual({
      kind: 'file',
      uploadId: 'u1',
      name: 'cv.pdf',
    })
  })

  it('maps every message of a fetched chat', async () => {
    apiFetch.mockResolvedValue({
      id: 'c1',
      messages: [
        { role: 'user', kind: 'file', content: 'cv.pdf', uploadId: 'u1' },
        { role: 'user', kind: 'text', content: 'Summarize it', uploadId: null },
      ],
    })

    const chat = await getChat('c1')

    expect(chat.messages.map((message) => message.kind)).toEqual(['file', 'text'])
  })
})
