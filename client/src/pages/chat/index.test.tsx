import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The children are covered by their own suites; stubbing them keeps this
// focused on the wiring the page itself owns.
vi.mock('../../components/composser', () => ({
  default: ({ onSend, isStreaming, onStop }: { onSend: (text: string) => void; isStreaming: boolean; onStop: () => void }) => (
    <div>
      <button type="button" onClick={() => onSend('hello')}>
        send
      </button>
      {isStreaming && (
        <button type="button" onClick={onStop}>
          stop
        </button>
      )}
    </div>
  ),
}))

vi.mock('../../components/message', () => ({
  default: ({ role, content }: { role: string; content?: string }) => (
    <div data-role={role}>{content}</div>
  ),
}))

vi.mock('../../components/sidebar/ChatSidebar', () => ({
  default: ({ isOpen, user, onSignOut, onUpgrade }: {
    isOpen: boolean
    user: { email: string | null } | null
    onSignOut: () => void
    onUpgrade: () => void
  }) => (
    <div>
      <span>sidebar {isOpen ? 'open' : 'closed'}</span>
      <span>account {user?.email ?? 'none'}</span>
      <button type="button" onClick={onSignOut}>
        sidebar sign out
      </button>
      <button type="button" onClick={onUpgrade}>
        sidebar upgrade
      </button>
    </div>
  ),
}))

const { useAuthStore } = await import('../../hooks/useAuthStore')
const { useChatStore } = await import('../../hooks/useChatStore')
const { default: ChatPage } = await import('./index')

const initialAuth = useAuthStore.getState()
const initialChat = useChatStore.getState()

const turn = (id: string, prompt: string, reply: string) => ({
  id,
  edits: [prompt],
  activeEditIndex: 0,
  responses: [reply],
})

beforeEach(() => {
  useAuthStore.setState({ ...initialAuth }, true)
  useChatStore.setState({ ...initialChat, loadChats: vi.fn() }, true)
})

describe('ChatPage', () => {
  it('loads the chat list on mount', () => {
    const loadChats = vi.fn()
    useChatStore.setState({ loadChats })

    render(<ChatPage />)

    expect(loadChats).toHaveBeenCalledOnce()
  })

  it('invites the user to start when there are no turns', () => {
    render(<ChatPage />)

    expect(screen.getByText('Start a new conversation')).toBeInTheDocument()
  })

  it('renders each turn with its reply', () => {
    useChatStore.setState({ turns: [turn('t1', 'what is 2+2', '4')] })

    render(<ChatPage />)

    expect(screen.getByText('what is 2+2')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('sends a message through the store', async () => {
    const sendMessage = vi.fn()
    useChatStore.setState({ sendMessage })
    const user = userEvent.setup()
    render(<ChatPage />)

    await user.click(screen.getByRole('button', { name: 'send' }))

    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('hello')
  })

  it('surfaces a store error alongside the transcript', () => {
    useChatStore.setState({ turns: [turn('t1', 'hi', 'hello')], error: 'Chat not found.' })

    render(<ChatPage />)

    expect(screen.getByText('Chat not found.')).toBeInTheDocument()
  })

  it('offers a stop control while streaming', async () => {
    const stopStreaming = vi.fn()
    useChatStore.setState({ turns: [turn('t1', 'hi', '')], isStreaming: true, stopStreaming })
    const user = userEvent.setup()
    render(<ChatPage />)

    await user.click(screen.getAllByRole('button', { name: 'stop' })[0])

    expect(stopStreaming).toHaveBeenCalledOnce()
  })

  // The sidebar is presentational, so the page is what connects it to auth.
  it('hands the signed-in account to the sidebar', () => {
    useAuthStore.setState({ user: { id: '1', email: 'person@example.com', isAnonymous: false } })

    render(<ChatPage />)

    expect(screen.getByText('account person@example.com')).toBeInTheDocument()
  })

  it('wires the sidebar to sign out', async () => {
    const signOut = vi.fn()
    useAuthStore.setState({ signOut })
    const user = userEvent.setup()
    render(<ChatPage />)

    await user.click(screen.getByRole('button', { name: 'sidebar sign out' }))

    expect(signOut).toHaveBeenCalledOnce()
  })

  it('wires the sidebar to the guest upgrade', async () => {
    const startUpgrade = vi.fn()
    useAuthStore.setState({ startUpgrade })
    const user = userEvent.setup()
    render(<ChatPage />)

    await user.click(screen.getByRole('button', { name: 'sidebar upgrade' }))

    expect(startUpgrade).toHaveBeenCalledOnce()
  })

  it('opens the drawer from the mobile menu button', async () => {
    const user = userEvent.setup()
    render(<ChatPage />)

    expect(screen.getByText('sidebar closed')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open chat history' }))

    expect(screen.getByText('sidebar open')).toBeInTheDocument()
  })
})
