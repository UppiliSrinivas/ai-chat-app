import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './useAuthStore'
import { getCurrentUser, loginAsGuest, loginWithGoogle, logout, type User } from '../api/auth'

vi.mock('../api/auth', () => ({
  getCurrentUser: vi.fn(),
  loginAsGuest: vi.fn(),
  loginWithGoogle: vi.fn(),
  logout: vi.fn(),
}))

const guestUser: User = { id: 'u1', email: null, isAnonymous: true }
const googleUser: User = { id: 'u2', email: 'person@example.com', isAnonymous: false }

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: null, status: 'checking', isSubmitting: false, error: null })
})

describe('checkSession', () => {
  it('moves to signedIn when the cookie probe finds a user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(guestUser)

    await useAuthStore.getState().checkSession()

    expect(useAuthStore.getState()).toMatchObject({ user: guestUser, status: 'signedIn' })
  })

  it('moves to signedOut when there is no session', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)

    await useAuthStore.getState().checkSession()

    expect(useAuthStore.getState()).toMatchObject({ user: null, status: 'signedOut' })
  })
})

describe('ensureSession', () => {
  it('mints a guest account and marks the session signed in', async () => {
    vi.mocked(loginAsGuest).mockResolvedValue(guestUser)

    await useAuthStore.getState().ensureSession()

    expect(useAuthStore.getState()).toMatchObject({ user: guestUser, status: 'signedIn' })
  })

  it('does nothing when a session already exists', async () => {
    useAuthStore.setState({ user: googleUser, status: 'signedIn' })

    await useAuthStore.getState().ensureSession()

    expect(loginAsGuest).not.toHaveBeenCalled()
  })

  // Two rapid sends both find no user. Without a shared in-flight promise the
  // second mints a duplicate guest and the first one's chat is stranded.
  it('shares one request between callers that race', async () => {
    vi.mocked(loginAsGuest).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(guestUser), 10)),
    )

    await Promise.all([
      useAuthStore.getState().ensureSession(),
      useAuthStore.getState().ensureSession(),
    ])

    expect(loginAsGuest).toHaveBeenCalledTimes(1)
  })

  // The send that triggered this is what reports the failure, so it has to
  // travel rather than settle quietly into the store's error field.
  it('throws so the caller can say why the message failed', async () => {
    vi.mocked(loginAsGuest).mockRejectedValue(new Error('Server unavailable'))

    await expect(useAuthStore.getState().ensureSession()).rejects.toThrow('Server unavailable')
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('retries on the next send after a failure', async () => {
    vi.mocked(loginAsGuest).mockRejectedValueOnce(new Error('Server unavailable'))
    vi.mocked(loginAsGuest).mockResolvedValueOnce(guestUser)

    await expect(useAuthStore.getState().ensureSession()).rejects.toThrow()
    await useAuthStore.getState().ensureSession()

    expect(useAuthStore.getState().user).toEqual(guestUser)
  })
})

describe('signInWithGoogle', () => {
  it('passes the Google credential through to the API', async () => {
    vi.mocked(loginWithGoogle).mockResolvedValue(googleUser)

    await useAuthStore.getState().signInWithGoogle('google-id-token')

    expect(loginWithGoogle).toHaveBeenCalledWith('google-id-token')
    expect(useAuthStore.getState()).toMatchObject({ user: googleUser, status: 'signedIn' })
  })
})

describe('signOut', () => {
  it('clears the user and returns to signedOut', async () => {
    useAuthStore.setState({ user: googleUser, status: 'signedIn' })
    vi.mocked(logout).mockResolvedValue(undefined)

    await useAuthStore.getState().signOut()

    expect(useAuthStore.getState()).toMatchObject({ user: null, status: 'signedOut', error: null })
  })

  it('still signs out locally when the logout request fails', async () => {
    useAuthStore.setState({ user: googleUser, status: 'signedIn' })
    vi.mocked(logout).mockRejectedValue(new Error('Network down'))

    await useAuthStore.getState().signOut()

    expect(useAuthStore.getState()).toMatchObject({ user: null, status: 'signedOut' })
  })
})
