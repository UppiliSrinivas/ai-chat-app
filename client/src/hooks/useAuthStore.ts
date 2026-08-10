import { create } from 'zustand'
import { getCurrentUser, loginAsGuest, loginWithGoogle, logout, type User } from '../api/auth'

/** `checking` covers the initial cookie probe — the app shows nothing until
 *  it resolves, so a returning user never sees the sign-in page flash. */
type AuthStatus = 'checking' | 'signedOut' | 'signedIn'

type AuthState = {
  user: User | null
  status: AuthStatus
  isSubmitting: boolean
  error: string | null
  checkSession: () => Promise<void>
  signInAsGuest: () => Promise<void>
  signInWithGoogle: (credential: string) => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => {
  const runSignIn = async (signIn: () => Promise<User>) => {
    if (get().isSubmitting) return
    set({ isSubmitting: true, error: null })
    try {
      const user = await signIn()
      set({ user, status: 'signedIn' })
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
    error: null,

    checkSession: async () => {
      const user = await getCurrentUser()
      set({ user, status: user ? 'signedIn' : 'signedOut' })
    },

    signInAsGuest: () => runSignIn(loginAsGuest),

    signInWithGoogle: (credential) => runSignIn(() => loginWithGoogle(credential)),

    signOut: async () => {
      await logout().catch(() => undefined)
      set({ user: null, status: 'signedOut', error: null })
    },
  }
})
