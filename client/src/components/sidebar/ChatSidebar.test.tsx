import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatSidebar, { type ChatSidebarProps } from './ChatSidebar'

const chats = [
  { id: 'a', title: 'First chat', projectId: null, messageCount: 0, updatedAt: '' },
  { id: 'b', title: 'Second chat', projectId: null, messageCount: 0, updatedAt: '' },
]

const setup = (props: Partial<ChatSidebarProps> = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onSelect: vi.fn(),
    onNewChat: vi.fn(),
    onDelete: vi.fn(),
    onSignOut: vi.fn(),
    onUpgrade: vi.fn(),
    onNewProject: vi.fn(),
    onNewChatInProject: vi.fn(),
    onDeleteProject: vi.fn(),
  }
  render(<ChatSidebar chats={chats} activeChatId={null} isOpen={false} user={null} projects={[]} {...handlers} {...props} />)
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

  it('labels an anonymous account as Guest', () => {
    setup({ user: { id: '1', email: null, isAnonymous: true } })

    expect(screen.getByText('Guest')).toBeInTheDocument()
  })

  const project = { id: 'p1', name: 'Research', chatCount: 3, updatedAt: '' }

  it('lists projects with their chat counts', () => {
    setup({ isOpen: true, projects: [project] })

    expect(screen.getByText('Research')).toBeInTheDocument()
    expect(screen.getByText('3/10')).toBeInTheDocument()
  })

  it('starts a new chat inside a project', async () => {
    const { onNewChatInProject, user } = setup({ isOpen: true, projects: [project] })

    await user.click(screen.getByRole('button', { name: '+ New chat' }))

    expect(onNewChatInProject).toHaveBeenCalledExactlyOnceWith('p1')
  })

  // A full project can't take another chat, so the only forward action left
  // is starting a new project.
  it('offers a new project instead of a new chat when full', async () => {
    const { onNewProject, onNewChatInProject, user } = setup({
      isOpen: true,
      projects: [{ ...project, chatCount: 10 }],
    })

    expect(screen.queryByRole('button', { name: '+ New chat' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '+ New project' }))

    expect(onNewProject).toHaveBeenCalledOnce()
    expect(onNewChatInProject).not.toHaveBeenCalled()
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
})
