import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PromptDialog, { type PromptDialogProps } from './PromptDialog'

const setup = (props: Partial<PromptDialogProps> = {}) => {
  const handlers = { onSubmit: vi.fn(), onCancel: vi.fn() }
  render(
    <PromptDialog
      isOpen
      title="New project"
      label="Project name"
      placeholder="Research notes"
      submitLabel="Create"
      {...handlers}
      {...props}
    />,
  )
  return { ...handlers, user: userEvent.setup() }
}

describe('PromptDialog', () => {
  it('renders nothing while closed', () => {
    setup({ isOpen: false })

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('names itself and its field', () => {
    setup()

    expect(screen.getByRole('dialog')).toHaveAccessibleName('New project')
    expect(screen.getByRole('textbox', { name: 'Project name' })).toBeInTheDocument()
  })

  // The one thing you came here to do is type a name, so the caret has to be
  // waiting in the field — not on a button.
  it('puts initial focus in the input', () => {
    setup()

    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveFocus()
  })

  it('submits the typed value', async () => {
    const { onSubmit, user } = setup()

    await user.type(screen.getByRole('textbox', { name: 'Project name' }), 'Research notes')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Research notes')
  })

  it('submits on Enter', async () => {
    const { onSubmit, user } = setup()

    await user.type(screen.getByRole('textbox', { name: 'Project name' }), 'Research notes{Enter}')

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Research notes')
  })

  // Leading/trailing spaces are always a typo, never intent.
  it('trims the submitted value', async () => {
    const { onSubmit, user } = setup()

    await user.type(screen.getByRole('textbox', { name: 'Project name' }), '  Research notes  {Enter}')

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Research notes')
  })

  // A blank name would create an unnamed project the user then has to hunt
  // down and rename, so the button stays inert until there's something to name.
  it('refuses an empty name', async () => {
    const { onSubmit, user } = setup()

    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: 'Project name' }), '   {Enter}')

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('starts from an initial value', () => {
    setup({ initialValue: 'Marketing' })

    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue('Marketing')
  })

  // Reopening for a different project must not show whatever was typed and
  // abandoned the previous time.
  it('resets the field each time it opens', async () => {
    const user = userEvent.setup()
    const props = { title: 'Rename', label: 'Project name', onSubmit: vi.fn(), onCancel: vi.fn() }
    const { rerender } = render(<PromptDialog isOpen initialValue="Marketing" {...props} />)

    await user.type(screen.getByRole('textbox', { name: 'Project name' }), ' edits')
    rerender(<PromptDialog isOpen={false} initialValue="Marketing" {...props} />)
    rerender(<PromptDialog isOpen initialValue="Marketing" {...props} />)

    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue('Marketing')
  })

  it('cancels on the cancel button', async () => {
    const { onCancel, onSubmit, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('cancels on Escape', async () => {
    const { onCancel, onSubmit, user } = setup()

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('cancels when the backdrop is clicked', async () => {
    const { onCancel, user } = setup()

    await user.click(document.querySelector('div[aria-hidden="true"]')!)

    expect(onCancel).toHaveBeenCalledOnce()
  })

  // Same reason as ConfirmDialog: `position: fixed` resolves against a
  // transformed ancestor, and the sidebar this opens from always has one.
  it('renders outside its parent element', () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)

    render(
      <PromptDialog isOpen title="New project" label="Project name" onSubmit={vi.fn()} onCancel={vi.fn()} />,
      { container: parent },
    )

    expect(parent.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
  })
})
