import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Message from './index'

describe('Message', () => {
  it('renders a user message with its edit controls', () => {
    render(
      <Message
        role="user"
        content="my question"
        editIndex={1}
        editCount={1}
        onNavigateEdit={vi.fn()}
        onEdit={vi.fn()}
      />,
    )

    expect(screen.getByText('my question')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit message' })).toBeInTheDocument()
  })

  it('renders an assistant message with its response controls', () => {
    render(<Message role="assistant" content="the answer" />)

    expect(screen.getByText('the answer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy response' })).toBeInTheDocument()
  })
})
