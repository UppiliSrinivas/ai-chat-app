import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Composer from './index'

const setup = (props: Partial<React.ComponentProps<typeof Composer>> = {}) => {
  const onSend = vi.fn()
  render(<Composer onSend={onSend} {...props} />)
  return { onSend, user: userEvent.setup() }
}

describe('Composer', () => {
  // Sits with the composer rather than the page so it cannot drift out of
  // place, and names the build so a screenshot is enough to identify it.
  it('warns that answers can be wrong, naming the build', () => {
    setup()

    expect(screen.getByText(/^AI-Chat-App can make mistakes - V \d+\.\d+\.\d+$/)).toBeInTheDocument()
  })

  it('sends the trimmed draft and clears the box', async () => {
    const { onSend, user } = setup()

    await user.type(screen.getByRole('textbox'), '  hello  ')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(onSend).toHaveBeenCalledExactlyOnceWith('hello')
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('sends on Enter', async () => {
    const { onSend, user } = setup()

    await user.type(screen.getByRole('textbox'), 'hello{Enter}')

    expect(onSend).toHaveBeenCalledExactlyOnceWith('hello')
  })

  it('inserts a newline instead of sending on Shift+Enter', async () => {
    const { onSend, user } = setup()

    await user.type(screen.getByRole('textbox'), 'line one{Shift>}{Enter}{/Shift}line two')

    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toHaveValue('line one\nline two')
  })

  it('will not send a blank or whitespace-only draft', async () => {
    const { onSend, user } = setup()

    await user.type(screen.getByRole('textbox'), '   {Enter}')

    expect(onSend).not.toHaveBeenCalled()
  })

  it('disables the send button until there is something to send', async () => {
    const { user } = setup()

    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()

    await user.type(screen.getByRole('textbox'), 'hi')

    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled()
  })

  it('offers a stop control while streaming and calls onStop', async () => {
    const onStop = vi.fn()
    const { user } = setup({ isStreaming: true, onStop })

    await user.click(screen.getByRole('button', { name: 'Stop generating' }))

    expect(onStop).toHaveBeenCalledOnce()
  })

  it('does not send while a response is still streaming', async () => {
    const { onSend, user } = setup({ isStreaming: true })

    await user.type(screen.getByRole('textbox'), 'hello{Enter}')

    expect(onSend).not.toHaveBeenCalled()
  })

  it('disables the textarea when disabled', () => {
    setup({ disabled: true })

    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('shows a custom placeholder', () => {
    setup({ placeholder: 'Ask anything' })

    expect(screen.getByPlaceholderText('Ask anything')).toBeInTheDocument()
  })
})
