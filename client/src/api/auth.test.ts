import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))

vi.mock('./client', () => ({ apiFetch }))

const { getCurrentUser, loginAsGuest, loginWithGoogle, logout } = await import('./auth')

const person = { id: '1', email: 'person@example.com', isAnonymous: false }

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue(undefined)
})

describe('getCurrentUser', () => {
  it('returns the signed-in user', async () => {
    apiFetch.mockResolvedValue(person)

    await expect(getCurrentUser()).resolves.toEqual(person)
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/auth/me')
  })

  // A missing or expired cookie answers 401, which is the ordinary
  // signed-out case — it must read as "no user", not as a failure.
  it('resolves to null when there is no session', async () => {
    apiFetch.mockRejectedValue(new Error('Not authenticated.'))

    await expect(getCurrentUser()).resolves.toBeNull()
  })

  it('resolves to null when the network fails', async () => {
    apiFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(getCurrentUser()).resolves.toBeNull()
  })
})

describe('loginAsGuest', () => {
  it('posts with no body at all', async () => {
    apiFetch.mockResolvedValue({ id: '2', email: null, isAnonymous: true })

    await loginAsGuest()

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/auth/anonymous', { method: 'POST' })
  })
})

describe('loginWithGoogle', () => {
  it('sends the credential as JSON', async () => {
    apiFetch.mockResolvedValue(person)

    await loginWithGoogle('header.payload.signature')

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential: 'header.payload.signature' }),
    })
  })

  // Unlike getCurrentUser this must reject: the sign-in page shows the
  // server's message, so swallowing it would fail silently.
  it('propagates a rejected credential', async () => {
    apiFetch.mockRejectedValue(new Error('Google sign-in failed.'))

    await expect(loginWithGoogle('bad')).rejects.toThrow('Google sign-in failed.')
  })
})

describe('logout', () => {
  it('posts to the logout route', async () => {
    await logout()

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/auth/logout', { method: 'POST' })
  })
})
