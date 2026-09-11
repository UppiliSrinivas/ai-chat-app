import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { onSuccessRef } = vi.hoisted(() => ({
  onSuccessRef: { current: null as ((response: { credential?: string }) => void) | null },
}))

// The real widget renders a cross-origin iframe that jsdom can't drive, so it
// is replaced with a button that hands back a credential the same way.
vi.mock('@react-oauth/google', () => ({
  GoogleLogin: ({ onSuccess }: { onSuccess: (response: { credential?: string }) => void }) => {
    onSuccessRef.current = onSuccess
    return <button type="button">Continue with Google</button>
  },
}))

const { useAuthStore } = await import('../../hooks/useAuthStore')
const { default: SignInPage } = await import('./index')

const guestUser = { id: 'u1', email: null, isAnonymous: true }

const initialState = useAuthStore.getState()

beforeEach(() => {
  useAuthStore.setState(initialState, true)
  onSuccessRef.current = null
})

describe('SignInPage', () => {
  // Someone who has never sent a message has no account and so no chats to
  // carry over — they are simply signing in.
  it('welcomes a visitor who has nothing to carry over', () => {
    render(<SignInPage />)

    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument()
    expect(screen.getByText('Sign in to start chatting')).toBeInTheDocument()
  })

  it('never offers to continue as a guest', () => {
    render(<SignInPage />)

    expect(screen.queryByRole('button', { name: 'Continue as guest' })).toBeNull()
  })

  it('passes a Google credential straight to the store', () => {
    const signInWithGoogle = vi.fn()
    useAuthStore.setState({ signInWithGoogle })
    render(<SignInPage />)

    onSuccessRef.current?.({ credential: 'header.payload.signature' })

    expect(signInWithGoogle).toHaveBeenCalledExactlyOnceWith('header.payload.signature')
  })

  // Google can fire onSuccess without a credential; calling the server with
  // undefined would just produce a confusing 400.
  it('ignores a Google response with no credential', () => {
    const signInWithGoogle = vi.fn()
    useAuthStore.setState({ signInWithGoogle })
    render(<SignInPage />)

    onSuccessRef.current?.({})

    expect(signInWithGoogle).not.toHaveBeenCalled()
  })

  it('shows the store error to the user', () => {
    useAuthStore.setState({ error: 'Google sign-in failed.' })
    render(<SignInPage />)

    expect(screen.getByRole('alert')).toHaveTextContent('Google sign-in failed.')
  })

  describe('when a guest is upgrading', () => {
    beforeEach(() => {
      useAuthStore.setState({ isUpgrading: true, status: 'signedIn', user: guestUser })
    })

    it('explains that existing chats carry over', () => {
      render(<SignInPage />)

      expect(screen.getByRole('heading', { name: 'Save your chats' })).toBeInTheDocument()
    })

    // Offering "continue as guest" to someone already chatting as a guest is
    // a dead end — they need a way back to the conversation they left.
    it('offers a way back instead of another guest sign-in', () => {
      render(<SignInPage />)

      expect(screen.queryByRole('button', { name: 'Continue as guest' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Back to chat' })).toBeInTheDocument()
    })

    it('returns to the chat without touching the session', async () => {
      const user = userEvent.setup()
      render(<SignInPage />)

      await user.click(screen.getByRole('button', { name: 'Back to chat' }))

      expect(useAuthStore.getState().isUpgrading).toBe(false)
      expect(useAuthStore.getState().status).toBe('signedIn')
    })
  })
})
