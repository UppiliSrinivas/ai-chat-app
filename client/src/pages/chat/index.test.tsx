import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
const { MAX_MESSAGES_PER_CHAT } = await import('../../lib/limits')

const initialAuth = useAuthStore.getState()
const initialChat = useChatStore.getState()
const initialProject = useProjectStore.getState()

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

  it('loads projects on mount', () => {
    const loadProjects = vi.fn()
    useProjectStore.setState({ loadProjects })

    render(<ChatPage />)

    expect(loadProjects).toHaveBeenCalledOnce()
  })

  // At the cap the chat is read-only: the only way forward is a new chat, so
  // the composer is replaced rather than merely disabled.
  it('replaces the composer with a new-chat button at the message cap', () => {
    useChatStore.setState({
      chatId: 'c1',
      turns: [turn('t1', 'hi', 'hello')],
      chats: [{ id: 'c1', title: 'Full', projectId: null, messageCount: MAX_MESSAGES_PER_CHAT, updatedAt: '' }],
    })

    render(<ChatPage />)

    expect(screen.queryByRole('button', { name: 'send' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Start a new chat' })).toBeInTheDocument()
  })

  it('keeps the composer below the cap', () => {
    useChatStore.setState({
      chatId: 'c1',
      turns: [turn('t1', 'hi', 'hello')],
      chats: [{ id: 'c1', title: 'Fine', projectId: null, messageCount: MAX_MESSAGES_PER_CHAT - 1, updatedAt: '' }],
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
      chats: [{ id: 'c1', title: 'Full', projectId: null, messageCount: MAX_MESSAGES_PER_CHAT, updatedAt: '' }],
      startNewChat,
    })
    const user = userEvent.setup()
    render(<ChatPage />)

    await user.click(screen.getByRole('button', { name: 'Start a new chat' }))

    expect(startNewChat).toHaveBeenCalledOnce()
  })
})
