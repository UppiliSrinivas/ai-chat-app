import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AssistantMessage, { type AssistantMessageProps } from './AssistantMessage'

const setup = (props: Partial<AssistantMessageProps> = {}) => {
  const handlers = { onFeedback: vi.fn(), onShare: vi.fn() }
  render(<AssistantMessage content="The answer" {...handlers} {...props} />)
  return { ...handlers, user: userEvent.setup() }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AssistantMessage', () => {
  it('renders the response text', () => {
    setup()

    expect(screen.getByText('The answer')).toBeInTheDocument()
  })

  it('hides the action row while the response is still streaming', () => {
    setup({ isStreaming: true })

    expect(screen.queryByRole('button', { name: 'Copy response' })).not.toBeInTheDocument()
  })

  it('shows the action row once streaming has finished', () => {
    setup({ isStreaming: false })

    expect(screen.getByRole('button', { name: 'Copy response' })).toBeInTheDocument()
  })

  it('copies the response to the clipboard', async () => {
    const { user } = setup()

    await user.click(screen.getByRole('button', { name: 'Copy response' }))

    await expect(navigator.clipboard.readText()).resolves.toBe('The answer')
  })

  it('reports thumbs-up feedback and marks the control pressed', async () => {
    const { onFeedback, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Good response' }))

    expect(onFeedback).toHaveBeenCalledExactlyOnceWith('up')
    expect(screen.getByRole('button', { name: 'Good response' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clears feedback when the same control is clicked again', async () => {
    const { onFeedback, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Good response' }))
    await user.click(screen.getByRole('button', { name: 'Good response' }))

    expect(screen.getByRole('button', { name: 'Good response' })).toHaveAttribute('aria-pressed', 'false')
    expect(onFeedback).toHaveBeenCalledTimes(1)
  })

  it('switches from thumbs-up to thumbs-down', async () => {
    const { onFeedback, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Good response' }))
    await user.click(screen.getByRole('button', { name: 'Bad response' }))

    expect(onFeedback).toHaveBeenLastCalledWith('down')
    expect(screen.getByRole('button', { name: 'Good response' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Bad response' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shares the response content', async () => {
    const { onShare, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Share response' }))

    expect(onShare).toHaveBeenCalledExactlyOnceWith('The answer')
  })
})
