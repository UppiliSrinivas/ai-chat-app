import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmDialog, { type ConfirmDialogProps } from './ConfirmDialog'

const setup = (props: Partial<ConfirmDialogProps> = {}) => {
  const handlers = { onConfirm: vi.fn(), onCancel: vi.fn() }
  render(
    <ConfirmDialog
      isOpen
      title='Delete "First chat"?'
      body="This can't be undone."
      {...handlers}
      {...props}
    />,
  )
  return { ...handlers, user: userEvent.setup() }
}

describe('ConfirmDialog', () => {
  it('renders nothing while closed', () => {
    setup({ isOpen: false })

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('names what is being deleted', () => {
    setup()

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Delete "First chat"?')
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument()
  })

  it('confirms on the confirm button', async () => {
    const { onConfirm, onCancel, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancels on the cancel button', async () => {
    const { onConfirm, onCancel, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('accepts a custom confirm label', () => {
    setup({ confirmLabel: 'Delete project and chats' })

    expect(screen.getByRole('button', { name: 'Delete project and chats' })).toBeInTheDocument()
  })

  // Escape is the expected way out of a modal, and a destructive dialog must
  // never trap someone who opened it by mistake.
  it('cancels on Escape', async () => {
    const { onCancel, onConfirm, user } = setup()

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('cancels when the backdrop is clicked', async () => {
    const { onCancel, user } = setup()

    await user.click(document.querySelector('div[aria-hidden="true"]')!)

    expect(onCancel).toHaveBeenCalledOnce()
  })

  // Confirm must never be the default focus target: the whole point is to
  // make destroying something deliberate.
  it('puts initial focus on cancel', () => {
    setup()

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  // A fixed-position dialog inside a transformed ancestor resolves against that
  // ancestor, not the viewport — so it must portal out of the tree entirely.
  it('renders outside its parent element', () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)

    render(
      <ConfirmDialog isOpen title="Delete?" body="Gone." onConfirm={vi.fn()} onCancel={vi.fn()} />,
      { container: parent },
    )

    expect(parent.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
  })
})
