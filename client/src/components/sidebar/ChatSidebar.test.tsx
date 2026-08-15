import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatSidebar, { type ChatSidebarProps } from './ChatSidebar'

const chats = [
  { id: 'a', title: 'First chat', updatedAt: '' },
  { id: 'b', title: 'Second chat', updatedAt: '' },
]

const setup = (props: Partial<ChatSidebarProps> = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onSelect: vi.fn(),
    onNewChat: vi.fn(),
    onDelete: vi.fn(),
  }
  render(<ChatSidebar chats={chats} activeChatId={null} isOpen={false} {...handlers} {...props} />)
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

  it('deletes a chat without also selecting it', async () => {
    const { onDelete, onSelect, user } = setup()

    await user.click(screen.getAllByRole('button', { name: 'Delete chat' })[0])

    expect(onDelete).toHaveBeenCalledExactlyOnceWith('a')
    expect(onSelect).not.toHaveBeenCalled()
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
})
