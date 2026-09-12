import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AssistantMessage, { type AssistantMessageProps } from './AssistantMessage'

const setup = (props: Partial<AssistantMessageProps> = {}) => {
  const handlers = { onFeedback: vi.fn(), onShare: vi.fn() }
  const view = render(<AssistantMessage content="The answer" {...handlers} {...props} />)
  return { ...handlers, ...view, user: userEvent.setup() }
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

describe('AssistantMessage tool activity', () => {
  const running = {
    id: 'call_1',
    name: 'getWeather',
    status: 'running' as const,
    label: 'Checking the weather in Chennai',
  }

  it('names the operation that is running', () => {
    setup({ content: '', isStreaming: true, tools: [running] })

    expect(screen.getByText('Checking the weather in Chennai')).toBeInTheDocument()
  })

  it('lists parallel calls separately', () => {
    const second = { ...running, id: 'call_2', label: 'Checking the weather in Mumbai' }
    setup({ content: '', isStreaming: true, tools: [running, second] })

    expect(screen.getByText('Checking the weather in Chennai')).toBeInTheDocument()
    expect(screen.getByText('Checking the weather in Mumbai')).toBeInTheDocument()
  })

  // The tool line already says work is happening, so the dots would repeat it.
  it('replaces the typing dots rather than sitting beside them', () => {
    const { container } = setup({ content: '', isStreaming: true, tools: [running] })

    expect(container.querySelectorAll('.animate-bounce')).toHaveLength(0)
  })

  it('still shows the typing dots when no tool is running', () => {
    const { container } = setup({ content: '', isStreaming: true })

    expect(container.querySelectorAll('.animate-bounce')).toHaveLength(3)
  })

  it('keeps the finished tool line visible while the answer streams in', () => {
    setup({ content: 'It is warm.', isStreaming: true, tools: [{ ...running, status: 'done' }] })

    expect(screen.getByText('Checking the weather in Chennai')).toBeInTheDocument()
    expect(screen.getByText('It is warm.')).toBeInTheDocument()
  })
})
