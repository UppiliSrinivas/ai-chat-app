import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))

vi.mock('./client', () => ({ apiFetch }))

const { createChat, deleteChat, getChat, listChats } = await import('./chats')

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
