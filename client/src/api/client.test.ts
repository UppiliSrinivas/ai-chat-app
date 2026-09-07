import { afterEach, describe, expect, it, vi } from 'vitest'
import { API_BASE_URL, apiFetch } from './client'

const mockFetch = (impl: (...args: unknown[]) => unknown) => {
  vi.stubGlobal('fetch', vi.fn(impl))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch', () => {
  it('always sends the session cookie and a JSON content-type', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ id: '1' }) }))

    await apiFetch('/chats')

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/chats`,
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
  })

  it('resolves with the parsed JSON body on success', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ id: 'abc' }) }))

    await expect(apiFetch('/chats/abc')).resolves.toEqual({ id: 'abc' })
  })

  it('returns undefined for a 204 response without parsing a body', async () => {
    const json = vi.fn()
    mockFetch(async () => ({ ok: true, status: 204, json }))

    await expect(apiFetch('/chats/abc', { method: 'DELETE' })).resolves.toBeUndefined()
    expect(json).not.toHaveBeenCalled()
  })

  it('throws using the server-provided message on a non-2xx response', async () => {
    mockFetch(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ message: '`chatId` is required and must be a string.' }),
    }))

    await expect(apiFetch('/gemini/chat', { method: 'POST' })).rejects.toThrow(
      '`chatId` is required and must be a string.',
    )
  })

  it('falls back to a generic message when the error body is not JSON', async () => {
    mockFetch(async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json')
      },
    }))

    await expect(apiFetch('/chats')).rejects.toThrow('Request failed with status 500')
  })

  it('preserves caller-supplied init like method and body', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({}) }))

    await apiFetch('/chats', { method: 'POST', body: JSON.stringify({}) })

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/chats`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({}) }),
    )
  })
})
