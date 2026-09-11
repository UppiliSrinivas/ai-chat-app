import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SaveChatNudge from './SaveChatNudge'

describe('SaveChatNudge', () => {
  it('says what signing in is for', () => {
    render(<SaveChatNudge onSignIn={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.getByText('Sign in to save this chat.')).toBeInTheDocument()
  })

  it('hands the accept straight to the caller', async () => {
    const onSignIn = vi.fn()
    const user = userEvent.setup()
    render(<SaveChatNudge onSignIn={onSignIn} onDismiss={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(onSignIn).toHaveBeenCalledOnce()
  })

  it('hands the dismissal straight to the caller', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(<SaveChatNudge onSignIn={vi.fn()} onDismiss={onDismiss} />)

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
