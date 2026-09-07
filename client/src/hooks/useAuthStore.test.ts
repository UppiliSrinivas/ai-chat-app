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

describe('signInAsGuest', () => {
  it('stores the user and marks the session signed in', async () => {
    vi.mocked(loginAsGuest).mockResolvedValue(guestUser)

    await useAuthStore.getState().signInAsGuest()

    expect(useAuthStore.getState()).toMatchObject({ user: guestUser, status: 'signedIn', isSubmitting: false })
  })

  it('surfaces the failure message and stays signed out', async () => {
    vi.mocked(loginAsGuest).mockRejectedValue(new Error('Server unavailable'))

    await useAuthStore.getState().signInAsGuest()

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      error: 'Server unavailable',
      isSubmitting: false,
    })
  })

  it('ignores a second call while one is already in flight', async () => {
    vi.mocked(loginAsGuest).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(guestUser), 10)),
    )

    const first = useAuthStore.getState().signInAsGuest()
    await useAuthStore.getState().signInAsGuest()
    await first

    expect(loginAsGuest).toHaveBeenCalledTimes(1)
  })

  it('clears a previous error when a new attempt starts', async () => {
    useAuthStore.setState({ error: 'Stale failure' })
    vi.mocked(loginAsGuest).mockResolvedValue(guestUser)

    await useAuthStore.getState().signInAsGuest()

    expect(useAuthStore.getState().error).toBeNull()
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
