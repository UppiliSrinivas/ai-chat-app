import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UserMessage, { type UserMessageProps } from './UserMessage'
import { MAX_EDITS_PER_MESSAGE } from '../../hooks/useChatStore'

const setup = (props: Partial<UserMessageProps> = {}) => {
  const handlers = { onNavigateEdit: vi.fn(), onEdit: vi.fn() }
  render(<UserMessage content="original" editIndex={1} editCount={1} {...handlers} {...props} />)
  return { ...handlers, user: userEvent.setup() }
}

describe('UserMessage', () => {
  it('shows the message content', () => {
    setup()

    expect(screen.getByText('original')).toBeInTheDocument()
  })

  it('saves an edit and leaves edit mode', async () => {
    const { onEdit, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Edit message' }))
    const textarea = screen.getByRole('textbox')
    await user.clear(textarea)
    await user.type(textarea, 'edited')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(onEdit).toHaveBeenCalledExactlyOnceWith('edited')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('discards the draft on Cancel', async () => {
    const { onEdit, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Edit message' }))
    await user.type(screen.getByRole('textbox'), ' changed')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onEdit).not.toHaveBeenCalled()
    expect(screen.getByText('original')).toBeInTheDocument()
  })

  it('leaves edit mode on Escape without saving', async () => {
    const { onEdit, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Edit message' }))
    await user.type(screen.getByRole('textbox'), ' changed{Escape}')

    expect(onEdit).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('does not fire onEdit when the text is unchanged', async () => {
    const { onEdit, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Edit message' }))
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(onEdit).not.toHaveBeenCalled()
  })

  it('blocks editing once the edit limit is reached', async () => {
    setup({ editCount: MAX_EDITS_PER_MESSAGE + 1 })

    expect(screen.getByRole('button', { name: 'Edit limit reached' })).toBeDisabled()
  })

  it('hides the branch pager for a message with a single version', () => {
    setup({ editCount: 1 })

    expect(screen.queryByRole('button', { name: 'Previous edit' })).not.toBeInTheDocument()
  })

  it('pages between edit branches', async () => {
    const { onNavigateEdit, user } = setup({ editIndex: 2, editCount: 3 })

    expect(screen.getByText('2/3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous edit' }))
    expect(onNavigateEdit).toHaveBeenCalledWith('prev')

    await user.click(screen.getByRole('button', { name: 'Next edit' }))
    expect(onNavigateEdit).toHaveBeenCalledWith('next')
  })

  it('disables the pager arrows at each end', () => {
    const { unmount } = render(
      <UserMessage content="x" editIndex={1} editCount={3} onNavigateEdit={vi.fn()} onEdit={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Previous edit' })).toBeDisabled()
    unmount()

    render(<UserMessage content="x" editIndex={3} editCount={3} onNavigateEdit={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Next edit' })).toBeDisabled()
  })

  it('copies the message to the clipboard', async () => {
    const { user } = setup()

    await user.click(screen.getByRole('button', { name: 'Copy message' }))

    await expect(navigator.clipboard.readText()).resolves.toBe('original')
  })
})
