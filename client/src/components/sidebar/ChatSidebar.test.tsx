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
  }
  render(<ChatSidebar chats={chats} activeChatId={null} isOpen={false} user={null} {...handlers} {...props} />)
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

  it('deletes a chat without also selecting it, once confirmed', async () => {
    const { onDelete, onSelect, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Delete "First chat"' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete "First chat"' }))

    expect(onDelete).toHaveBeenCalledExactlyOnceWith('a')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('does not delete on the first click alone', async () => {
    const { onDelete, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Delete "First chat"' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm delete "First chat"' })).toBeInTheDocument()
  })

  // Arming one row and clicking away must not leave a second row primed to
  // delete on a single click.
  it('disarms the confirm when focus moves elsewhere', async () => {
    const { onDelete, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Delete "First chat"' }))
    await user.click(screen.getByRole('button', { name: 'Delete "Second chat"' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete "First chat"' })).toBeInTheDocument()
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
})
