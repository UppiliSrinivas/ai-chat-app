import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatRow, { type ChatRowProps } from './ChatRow'

const setup = (props: Partial<ChatRowProps> = {}) => {
  const handlers = { onSelect: vi.fn(), onDelete: vi.fn() }
  render(<ChatRow title="First chat" isActive={false} {...handlers} {...props} />)
  return { ...handlers, user: userEvent.setup() }
}

describe('ChatRow', () => {
  it('selects the chat when clicked', async () => {
    const { onSelect, user } = setup()

    await user.click(screen.getByRole('button', { name: 'First chat' }))

    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('marks the active chat for assistive tech', () => {
    setup({ isActive: true })

    expect(screen.getByRole('button', { name: 'First chat' })).toHaveAttribute('aria-current', 'page')
  })

  it('leaves an inactive chat unmarked', () => {
    setup()

    expect(screen.getByRole('button', { name: 'First chat' })).not.toHaveAttribute('aria-current')
  })

  it('asks to delete without selecting the chat', async () => {
    const { onDelete, onSelect, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Delete "First chat"' }))

    expect(onDelete).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
  })

  // The delete button only appears on hover, which a keyboard never triggers —
  // so it has to become visible on focus or it's unreachable without a mouse.
  it('reveals delete on keyboard focus', () => {
    setup()

    expect(screen.getByRole('button', { name: 'Delete "First chat"' })).toHaveClass('focus-visible:opacity-100')
  })
})
