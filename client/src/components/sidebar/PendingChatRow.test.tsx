import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import PendingChatRow from './PendingChatRow'

describe('PendingChatRow', () => {
  it('names the chat that has not been sent yet', () => {
    render(<PendingChatRow />)

    expect(screen.getByText('New chat…')).toBeInTheDocument()
  })

  // It stands for a chat the server has never seen, so there is nothing to
  // open and nothing to delete — it takes no handlers at all.
  it('offers nothing to click', () => {
    render(<PendingChatRow />)

    expect(screen.queryByRole('button')).toBeNull()
  })
})
