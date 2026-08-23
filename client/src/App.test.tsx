import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./pages/chat', () => ({ default: () => <div>chat page</div> }))
vi.mock('./pages/signin', () => ({ default: () => <div>sign in page</div> }))

const { useAuthStore } = await import('./hooks/useAuthStore')
const { useChatStore } = await import('./hooks/useChatStore')
const { useProjectStore } = await import('./hooks/useProjectStore')
const { default: App } = await import('./App')

const initialAuth = useAuthStore.getState()

beforeEach(() => {
  useAuthStore.setState({ ...initialAuth, checkSession: vi.fn() }, true)
})

describe('App', () => {
  it('probes for an existing session on mount', () => {
    const checkSession = vi.fn()
    useAuthStore.setState({ checkSession })

    render(<App />)

    expect(checkSession).toHaveBeenCalledOnce()
  })

  // Rendering either page before the cookie probe resolves would flash the
  // sign-in screen at someone who is already signed in.
  it('renders neither page while the session is still unknown', () => {
    useAuthStore.setState({ status: 'checking' })

    render(<App />)

    expect(screen.queryByText('chat page')).toBeNull()
    expect(screen.queryByText('sign in page')).toBeNull()
  })

  it('shows the sign-in page when signed out', () => {
    useAuthStore.setState({ status: 'signedOut' })

    render(<App />)

    expect(screen.getByText('sign in page')).toBeInTheDocument()
  })

  it('shows the chat page when signed in', () => {
    useAuthStore.setState({ status: 'signedIn' })

    render(<App />)

    expect(screen.getByText('chat page')).toBeInTheDocument()
  })

  // The guest keeps a valid session through the upgrade, so this deliberately
  // is not a signed-out check — the cookie has to survive for the server to
  // link the new identity to their existing chats.
  it('shows the sign-in page to a signed-in guest who is upgrading', () => {
    useAuthStore.setState({ status: 'signedIn', isUpgrading: true })

    render(<App />)

    expect(screen.getByText('sign in page')).toBeInTheDocument()
    expect(screen.queryByText('chat page')).toBeNull()
  })

  it('clears the previous session chats on sign out', () => {
    const reset = vi.fn()
    useChatStore.setState({ reset })
    useAuthStore.setState({ status: 'signedOut' })

    render(<App />)

    expect(reset).toHaveBeenCalled()
  })

  it('leaves the chat store alone while signed in', () => {
    const reset = vi.fn()
    useChatStore.setState({ reset })
    useAuthStore.setState({ status: 'signedIn' })

    render(<App />)

    expect(reset).not.toHaveBeenCalled()
  })

  it('clears the previous session projects on sign out', () => {
    const reset = vi.fn()
    useProjectStore.setState({ reset })
    useAuthStore.setState({ status: 'signedOut' })

    render(<App />)

    expect(reset).toHaveBeenCalled()
  })
})
