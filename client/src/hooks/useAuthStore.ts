import { create } from 'zustand'
import { getCurrentUser, loginAsGuest, loginWithGoogle, logout, type User } from '../api/auth'

/** `checking` covers the initial cookie probe — the app shows nothing until
 *  it resolves, so a returning user never sees the sign-in page flash. */
type AuthStatus = 'checking' | 'signedOut' | 'signedIn'

type AuthState = {
  user: User | null
  status: AuthStatus
  isSubmitting: boolean
  /** A guest asking to sign in properly. Shows the sign-in page while keeping
   *  the guest cookie, which is what lets the server upgrade that same user
   *  document in place instead of stranding its chats. */
  isUpgrading: boolean
  error: string | null
  checkSession: () => Promise<void>
  /** Mints the guest account a first message needs. Safe to call on every send. */
  ensureSession: () => Promise<void>
  signInWithGoogle: (credential: string) => Promise<void>
  startUpgrade: () => void
  cancelUpgrade: () => void
  signOut: () => Promise<void>
}

// Two rapid sends can both find no user. Without a shared in-flight promise
// the second mints a duplicate guest and the first one's chat is stranded.
let pendingGuestSession: Promise<User> | null = null

export const useAuthStore = create<AuthState>((set, get) => {
  const runSignIn = async (signIn: () => Promise<User>) => {
    if (get().isSubmitting) return
    set({ isSubmitting: true, error: null })
    try {
      const user = await signIn()
      set({ user, status: 'signedIn', isUpgrading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Could not sign in' })
    } finally {
      set({ isSubmitting: false })
    }
  }

  return {
    user: null,
    status: 'checking',
    isSubmitting: false,
    isUpgrading: false,
    error: null,

    checkSession: async () => {
      const user = await getCurrentUser()
      set({ user, status: user ? 'signedIn' : 'signedOut' })
    },

    ensureSession: async () => {
      if (get().user) return

      pendingGuestSession ??= loginAsGuest()
      try {
        const user = await pendingGuestSession
        set({ user, status: 'signedIn' })
      } finally {
        pendingGuestSession = null
      }
    },

    signInWithGoogle: (credential) => runSignIn(() => loginWithGoogle(credential)),

    startUpgrade: () => set({ isUpgrading: true, error: null }),

    cancelUpgrade: () => set({ isUpgrading: false, error: null }),

    signOut: async () => {
      await logout().catch(() => undefined)
      set({ user: null, status: 'signedOut', isUpgrading: false, error: null })
    },
  }
})
