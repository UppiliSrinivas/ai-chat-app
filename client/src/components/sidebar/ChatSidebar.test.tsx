import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatSidebar, { type ChatSidebarProps } from './ChatSidebar'
import { MAX_CHATS_PER_PROJECT } from '../../lib/limits'

const chats = [
  { id: 'a', title: 'First chat', projectId: null, messageCount: 0, tokenCount: 0, updatedAt: '' },
  { id: 'b', title: 'Second chat', projectId: null, messageCount: 0, tokenCount: 0, updatedAt: '' },
]

const setup = (props: Partial<ChatSidebarProps> = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onSelect: vi.fn(),
    onNewChat: vi.fn(),
    onDelete: vi.fn(),
    onSignOut: vi.fn(),
    onUpgrade: vi.fn(),
    onCreateProject: vi.fn(),
    onRenameProject: vi.fn(),
    onNewChatInProject: vi.fn(),
    onDeleteProject: vi.fn(),
  }
  render(
    <ChatSidebar
      chats={chats}
      activeChatId={null}
      isOpen={false}
      user={null}
      projects={[]}
      projectError={null}
      pendingProjectId={null}
      {...handlers}
      {...props}
    />,
  )
  return { ...handlers, user: userEvent.setup() }
}

describe('ChatSidebar', () => {
  it('lists every chat by title', () => {
    setup()

    expect(screen.getByRole('button', { name: 'First chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Second chat' })).toBeInTheDocument()
  })

  it('invites the user to start a chat when the list is empty', () => {
    setup({ chats: [] })

    expect(screen.getByText('No chats yet')).toBeInTheDocument()
  })

  it('selects a chat and closes the mobile drawer', async () => {
    const { onSelect, onClose, user } = setup({ isOpen: true })

    await user.click(screen.getByRole('button', { name: 'First chat' }))

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('a')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('starts a new chat and closes the mobile drawer', async () => {
    const { onNewChat, onClose, user } = setup({ isOpen: true })

    await user.click(screen.getByRole('button', { name: /New chat/ }))

    expect(onNewChat).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  // isOpen:true throughout: the component sets `inert` on the aside while
  // closed on mobile, and jsdom ignores inert — so a test using the default
  // would pass on clicks a real browser refuses.
  it('asks before deleting a chat', async () => {
    const { onDelete, onSelect, user } = setup({ isOpen: true })

    await user.click(screen.getByRole('button', { name: 'Delete "First chat"' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Delete "First chat"?')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('deletes the chat once confirmed', async () => {
    const { onDelete, user } = setup({ isOpen: true })

    await user.click(screen.getByRole('button', { name: 'Delete "First chat"' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onDelete).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('leaves the chat alone when cancelled', async () => {
    const { onDelete, user } = setup({ isOpen: true })

    await user.click(screen.getByRole('button', { name: 'Delete "First chat"' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('hides the drawer from keyboard users while closed on mobile', () => {
    setup({ isOpen: false })

    expect(screen.getByRole('complementary', { hidden: true })).toHaveAttribute('inert')
  })

  it('closes when the backdrop is clicked', async () => {
    const { onClose, user } = setup({ isOpen: true })

    await user.click(document.querySelector('div[aria-hidden="true"]')!)

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows no backdrop while closed', () => {
    setup({ isOpen: false })

    expect(document.querySelector('div[aria-hidden="true"]')).toBeNull()
  })

  it('signs a real account out', async () => {
    const account = { id: '1', email: 'person@example.com', isAnonymous: false }
    const { onSignOut, user } = setup({ user: account })

    await user.click(screen.getByRole('button', { name: /Sign out/ }))

    expect(onSignOut).toHaveBeenCalledOnce()
  })

  // Signing a guest out would strand their chats — the cookie is their only
  // identity — so they get the upgrade path instead.
  it('offers a guest the upgrade instead of sign out', async () => {
    const guest = { id: '1', email: null, isAnonymous: true }
    const { onUpgrade, user } = setup({ user: guest })

    expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /Sign in to save chats/ }))

    expect(onUpgrade).toHaveBeenCalledOnce()
  })

  it('labels the account by email', () => {
    setup({ user: { id: '1', email: 'person@example.com', isAnonymous: false } })

    expect(screen.getByText('person@example.com')).toBeInTheDocument()
  })

  // The build identity has to be visible somewhere a user can read it back to
  // you, otherwise "which version are you on?" has no answer.
  it('shows the build it was compiled from', () => {
    setup()

    expect(screen.getByText(/^v\d+\.\d+\.\d+ · \S+$/)).toBeInTheDocument()
  })

  it('labels an anonymous account as Guest', () => {
    setup({ user: { id: '1', email: null, isAnonymous: true } })

    expect(screen.getByText('Guest')).toBeInTheDocument()
  })

  const project = { id: 'p1', name: 'Research', chatCount: 3, updatedAt: '' }
  const filedChat = { id: 'c', title: 'Filed chat', projectId: 'p1', messageCount: 0, tokenCount: 0, updatedAt: '' }

  it('lists projects with their chat counts', () => {
    setup({ isOpen: true, projects: [project] })

    expect(screen.getByText('Research')).toBeInTheDocument()
    expect(screen.getByText(`3/${MAX_CHATS_PER_PROJECT}`)).toBeInTheDocument()
  })

  // Creating a project used to make an unnamed "New project" on one click,
  // with no way to name it — the name is the whole point of a project.
  it('names a project before creating it', async () => {
    const { onCreateProject, user } = setup({ isOpen: true })

    await user.click(screen.getByRole('button', { name: 'New project' }))
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), 'Research')
    await user.click(screen.getByRole('button', { name: 'Create project' }))

    expect(onCreateProject).toHaveBeenCalledExactlyOnceWith('Research')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('creates nothing when the name dialog is cancelled', async () => {
    const { onCreateProject, user } = setup({ isOpen: true })

    await user.click(screen.getByRole('button', { name: 'New project' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCreateProject).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renames a project from its current name', async () => {
    const { onRenameProject, user } = setup({ isOpen: true, projects: [project] })

    await user.click(screen.getByRole('button', { name: 'Rename project "Research"' }))
    const input = screen.getByRole('textbox', { name: 'Project name' })
    expect(input).toHaveValue('Research')

    await user.clear(input)
    await user.type(input, 'Deep research{Enter}')

    expect(onRenameProject).toHaveBeenCalledExactlyOnceWith('p1', 'Deep research')
  })

  it('lists a project’s chats when the project is clicked', async () => {
    const { user } = setup({ isOpen: true, projects: [project], chats: [...chats, filedChat] })

    await user.click(screen.getByRole('button', { name: /^Research/ }))

    expect(screen.getByRole('button', { name: 'Filed chat' })).toBeInTheDocument()
  })

  it('selects a project chat and closes the mobile drawer', async () => {
    const { onSelect, onClose, user } = setup({
      isOpen: true,
      projects: [project],
      chats: [...chats, filedChat],
    })

    await user.click(screen.getByRole('button', { name: /^Research/ }))
    await user.click(screen.getByRole('button', { name: 'Filed chat' }))

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('c')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('starts a new chat inside a project and closes the mobile drawer', async () => {
    const { onNewChatInProject, onClose, user } = setup({ isOpen: true, projects: [project] })

    await user.click(screen.getByRole('button', { name: /^Research/ }))
    await user.click(screen.getByRole('button', { name: '+ New chat' }))

    expect(onNewChatInProject).toHaveBeenCalledExactlyOnceWith('p1')
    expect(onClose).toHaveBeenCalledOnce()
  })

  // Deleting a project destroys its chats, so the dialog has to say the
  // number out loud rather than a generic warning.
  it('names the chat count when deleting a project', async () => {
    const { onDeleteProject, user } = setup({ isOpen: true, projects: [project] })

    await user.click(screen.getByRole('button', { name: 'Delete project "Research"' }))

    expect(screen.getByText(/its 3 chats/)).toBeInTheDocument()
    expect(onDeleteProject).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Delete project and chats' }))

    expect(onDeleteProject).toHaveBeenCalledExactlyOnceWith('p1')
  })

  it('says "1 chat" rather than "1 chats"', async () => {
    const { user } = setup({ isOpen: true, projects: [{ ...project, chatCount: 1 }] })

    await user.click(screen.getByRole('button', { name: 'Delete project "Research"' }))

    expect(screen.getByText(/its 1 chat\./)).toBeInTheDocument()
  })

  // A failed project create or delete used to leave no trace on screen at all.
  it('shows a project failure', () => {
    setup({ isOpen: true, projectError: 'Too many requests. Please try again shortly.' })

    expect(screen.getByRole('alert')).toHaveTextContent('Too many requests. Please try again shortly.')
  })

  it('stays quiet when projects are fine', () => {
    setup({ isOpen: true, projects: [project] })

    expect(screen.queryByRole('alert')).toBeNull()
  })

  // A chat inside a project belongs under that project, not in the flat list —
  // otherwise it looks unfiled, and the delete dialog's "and its 3 chats"
  // counts rows the user can see nowhere.
  it('keeps a project chat out of the loose list', () => {
    setup({ isOpen: true, projects: [project], chats: [...chats, filedChat] })

    expect(screen.queryByRole('button', { name: 'Filed chat' })).toBeNull()
    expect(screen.getByRole('button', { name: 'First chat' })).toBeInTheDocument()
  })

  it('says there are no chats when every chat is inside a project', () => {
    setup({ isOpen: true, projects: [project], chats: [filedChat] })

    expect(screen.getByText('No chats yet')).toBeInTheDocument()
  })

  // Deleting a chat that lives inside a project must go through the same
  // confirm dialog as a loose one, not delete on the first click.
  it('confirms before deleting a chat inside a project', async () => {
    const { onDelete, user } = setup({ isOpen: true, projects: [project], chats: [filedChat] })

    await user.click(screen.getByRole('button', { name: /^Research/ }))
    await user.click(screen.getByRole('button', { name: 'Delete "Filed chat"' }))

    expect(onDelete).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onDelete).toHaveBeenCalledExactlyOnceWith('c')
  })
})
