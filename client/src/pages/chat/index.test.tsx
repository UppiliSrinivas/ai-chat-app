import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  default: ({
    isOpen,
    user,
    projects,
    projectError,
    pendingProjectId,
    onSignOut,
    onUpgrade,
    onCreateProject,
    onRenameProject,
    onDeleteProject,
  }: {
    isOpen: boolean
    user: { email: string | null } | null
    projects: { id: string }[]
    projectError: string | null
    pendingProjectId: string | null
    onSignOut: () => void
    onUpgrade: () => void
    onCreateProject: (name: string) => void
    onRenameProject: (projectId: string, name: string) => void
    onDeleteProject: (projectId: string) => void
  }) => (
    <div>
      <span>sidebar {isOpen ? 'open' : 'closed'}</span>
      <span>account {user?.email ?? 'none'}</span>
      <span>projects {projects.length}</span>
      <span>project error {projectError ?? 'none'}</span>
      <span>pending project {pendingProjectId ?? 'none'}</span>
      <button type="button" onClick={onSignOut}>sidebar sign out</button>
      <button type="button" onClick={onUpgrade}>sidebar upgrade</button>
      <button type="button" onClick={() => onCreateProject('Research')}>sidebar create project</button>
      <button type="button" onClick={() => onRenameProject('p1', 'Deep research')}>sidebar rename project</button>
      <button type="button" onClick={() => onDeleteProject('p1')}>sidebar delete project</button>
    </div>
  ),
}))

const { useAuthStore } = await import('../../hooks/useAuthStore')
const { useChatStore } = await import('../../hooks/useChatStore')
const { useProjectStore } = await import('../../hooks/useProjectStore')
const { default: ChatPage } = await import('./index')
const { MAX_CHAT_TOKENS } = await import('../../lib/limits')

const initialAuth = useAuthStore.getState()
const initialChat = useChatStore.getState()
const initialProject = useProjectStore.getState()

const guestUser = { id: 'u1', email: null, isAnonymous: true }
const memberUser = { id: 'u2', email: 'person@example.com', isAnonymous: false }

const turn = (id: string, prompt: string, reply: string) => ({
  id,
  edits: [prompt],
  activeEditIndex: 0,
  responses: [reply],
})

beforeEach(() => {
  useAuthStore.setState({ ...initialAuth }, true)
  useChatStore.setState({ ...initialChat, loadChats: vi.fn() }, true)
  useProjectStore.setState({ ...initialProject, loadProjects: vi.fn() }, true)
})

describe('ChatPage', () => {
  it('loads the chat list once there is an account', () => {
    const loadChats = vi.fn()
    useAuthStore.setState({ user: guestUser })
    useChatStore.setState({ loadChats })

    render(<ChatPage />)

    expect(loadChats).toHaveBeenCalledOnce()
  })

  // A visitor who has never sent a message has no session, so both calls would
  // 401 and leave a project error on screen that they cannot act on.
  it('loads nothing while there is no account', () => {
    const loadChats = vi.fn()
    const loadProjects = vi.fn()
    useChatStore.setState({ loadChats })
    useProjectStore.setState({ loadProjects })

    render(<ChatPage />)

    expect(loadChats).not.toHaveBeenCalled()
    expect(loadProjects).not.toHaveBeenCalled()
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

  it('loads projects once there is an account', () => {
    const loadProjects = vi.fn()
    useAuthStore.setState({ user: guestUser })
    useProjectStore.setState({ loadProjects })

    render(<ChatPage />)

    expect(loadProjects).toHaveBeenCalledOnce()
  })

  describe('the sign-in nudge', () => {
    const twoTurns = [turn('t1', 'hi', 'hello'), turn('t2', 'more', 'sure')]

    it('asks a guest to sign in once the chat is worth saving', () => {
      useAuthStore.setState({ user: guestUser })
      useChatStore.setState({ turns: twoTurns })

      render(<ChatPage />)

      expect(screen.getByText('Sign in to save this chat.')).toBeInTheDocument()
    })

    it('leaves a signed-in user alone', () => {
      useAuthStore.setState({ user: memberUser })
      useChatStore.setState({ turns: twoTurns })

      render(<ChatPage />)

      expect(screen.queryByText('Sign in to save this chat.')).toBeNull()
    })

    it('holds off until there is something to save', () => {
      useAuthStore.setState({ user: guestUser })
      useChatStore.setState({ turns: [turn('t1', 'hi', 'hello')] })

      render(<ChatPage />)

      expect(screen.queryByText('Sign in to save this chat.')).toBeNull()
    })

    it('takes a guest who accepts to the sign-in page', async () => {
      const startUpgrade = vi.fn()
      useAuthStore.setState({ user: guestUser, startUpgrade })
      useChatStore.setState({ turns: twoTurns })
      const user = userEvent.setup()
      render(<ChatPage />)

      await user.click(screen.getByRole('button', { name: 'Sign in' }))

      expect(startUpgrade).toHaveBeenCalledOnce()
    })

    it('goes away when dismissed', async () => {
      useAuthStore.setState({ user: guestUser })
      useChatStore.setState({ turns: twoTurns })
      const user = userEvent.setup()
      render(<ChatPage />)

      await user.click(screen.getByRole('button', { name: 'Dismiss' }))

      expect(screen.queryByText('Sign in to save this chat.')).toBeNull()
    })
  })

  // At the cap the chat is read-only: the only way forward is a new chat, so
  // the composer is replaced rather than merely disabled.
  it('replaces the composer with a new-chat button at the token cap', () => {
    useChatStore.setState({
      chatId: 'c1',
      turns: [turn('t1', 'hi', 'hello')],
      chats: [{ id: 'c1', title: 'Full', projectId: null, messageCount: 12, tokenCount: MAX_CHAT_TOKENS, updatedAt: '' }],
    })

    render(<ChatPage />)

    expect(screen.queryByRole('button', { name: 'send' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Start a new chat' })).toBeInTheDocument()
  })

  it('keeps the composer below the cap', () => {
    useChatStore.setState({
      chatId: 'c1',
      turns: [turn('t1', 'hi', 'hello')],
      chats: [{ id: 'c1', title: 'Fine', projectId: null, messageCount: 12, tokenCount: MAX_CHAT_TOKENS - 1, updatedAt: '' }],
    })

    render(<ChatPage />)

    expect(screen.getByRole('button', { name: 'send' })).toBeInTheDocument()
  })

  // The server cascade takes the project's chats with it, so leaving the
  // sidebar list alone would keep rows that 404 on the next click.
  it('refetches the chats after a project is deleted', async () => {
    const loadChats = vi.fn()
    const removeProject = vi.fn().mockResolvedValue(undefined)
    useChatStore.setState({ loadChats })
    useProjectStore.setState({ removeProject })
    const user = userEvent.setup()
    render(<ChatPage />)
    loadChats.mockClear()

    await user.click(screen.getByRole('button', { name: 'sidebar delete project' }))

    expect(removeProject).toHaveBeenCalledExactlyOnceWith('p1')
    await waitFor(() => expect(loadChats).toHaveBeenCalledOnce())
  })

  it('creates a project under the name the sidebar collected', async () => {
    const addProject = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    useProjectStore.setState({ addProject })

    render(<ChatPage />)
    await user.click(screen.getByRole('button', { name: 'sidebar create project' }))

    expect(addProject).toHaveBeenCalledExactlyOnceWith('Research')
  })

  it('renames a project', async () => {
    const renameProject = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    useProjectStore.setState({ renameProject })

    render(<ChatPage />)
    await user.click(screen.getByRole('button', { name: 'sidebar rename project' }))

    expect(renameProject).toHaveBeenCalledExactlyOnceWith('p1', 'Deep research')
  })

  // The chat isn't created until the first message, so the sidebar needs to
  // know which project is holding the draft to show it there.
  it('hands the pending project to the sidebar', () => {
    useChatStore.setState({ pendingProjectId: 'p1' })

    render(<ChatPage />)

    expect(screen.getByText('pending project p1')).toBeInTheDocument()
  })

  it('hands a project failure to the sidebar', () => {
    useProjectStore.setState({ error: 'Could not create the project' })

    render(<ChatPage />)

    expect(screen.getByText('project error Could not create the project')).toBeInTheDocument()
  })

  // An error raised before the first reply arrives has no transcript to sit
  // beside, and used to render nowhere at all.
  // The case the anchor exists for: a reader who scrolls up mid-stream stops
  // being dragged back down, and gets one click to return.
  it('offers a way back to the newest message after scrolling away', async () => {
    const user = userEvent.setup()
    useChatStore.setState({ turns: [turn('t1', 'what is 2+2', '4')] })

    render(<ChatPage />)

    // jsdom does no layout, so the viewport is given dimensions by hand.
    const conversation = screen.getByRole('region', { name: 'Conversation' })
    let scrollTop = 0
    Object.defineProperty(conversation, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(conversation, 'clientHeight', { value: 400, configurable: true })
    Object.defineProperty(conversation, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value
      },
    })

    expect(screen.queryByRole('button', { name: 'Jump to latest' })).not.toBeInTheDocument()

    fireEvent.scroll(conversation)

    await user.click(screen.getByRole('button', { name: 'Jump to latest' }))

    expect(conversation.scrollTop).toBe(1000)
    expect(screen.queryByRole('button', { name: 'Jump to latest' })).not.toBeInTheDocument()
  })

  it('surfaces a store error on an empty chat too', () => {
    useChatStore.setState({ turns: [], error: 'Could not create the chat' })

    render(<ChatPage />)

    expect(screen.getByText('Could not create the chat')).toBeInTheDocument()
  })

  it('starts a new chat from the cap notice', async () => {
    const startNewChat = vi.fn()
    useChatStore.setState({
      chatId: 'c1',
      turns: [turn('t1', 'hi', 'hello')],
      chats: [{ id: 'c1', title: 'Full', projectId: null, messageCount: 12, tokenCount: MAX_CHAT_TOKENS, updatedAt: '' }],
      startNewChat,
    })
    const user = userEvent.setup()
    render(<ChatPage />)

    await user.click(screen.getByRole('button', { name: 'Start a new chat' }))

    expect(startNewChat).toHaveBeenCalledOnce()
  })
})
