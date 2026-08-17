import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MarkdownContent from './MarkdownContent'

describe('MarkdownContent', () => {
  it('renders markdown as HTML rather than literal text', () => {
    render(<MarkdownContent content="Some **bold** text" />)

    expect(screen.getByText('bold').tagName).toBe('STRONG')
  })

  it('renders GitHub-flavoured tables', () => {
    render(<MarkdownContent content={'| a | b |\n| - | - |\n| 1 | 2 |'} />)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '1' })).toBeInTheDocument()
  })

  it('renders links', () => {
    render(<MarkdownContent content="[docs](https://example.com)" />)

    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('href', 'https://example.com')
  })

  // Inline code and fenced blocks share one component; only the block form
  // gets the copy button, so this is the branch that matters.
  it('renders inline code without a copy button', () => {
    render(<MarkdownContent content="Use `npm run dev` to start" />)

    expect(screen.getByText('npm run dev').tagName).toBe('CODE')
    expect(screen.queryByRole('button', { name: 'Copy code' })).toBeNull()
  })

  it('gives a fenced block a copy button', () => {
    render(<MarkdownContent content={'```js\nconst x = 1\n```'} />)

    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument()
  })

  it('tags a fenced block with its language', () => {
    const { container } = render(<MarkdownContent content={'```python\nx = 1\n```'} />)

    expect(container.querySelector('code.language-python')).not.toBeNull()
  })

  // An unlabelled fence still renders as a block; it just has no language.
  it('falls back to plaintext for an unlabelled fence', () => {
    const { container } = render(<MarkdownContent content={'```\nline one\nline two\n```'} />)

    expect(container.querySelector('code.language-plaintext')).not.toBeNull()
  })

  // react-markdown gives an unlabelled fence no className, so a single-line
  // one is indistinguishable from inline code and renders inline — no copy
  // button. Pinned as current behaviour, not as a desirable one.
  it('renders a single-line unlabelled fence as inline code', () => {
    render(<MarkdownContent content={'```\nplain\n```'} />)

    expect(screen.getByText('plain').tagName).toBe('CODE')
    expect(screen.queryByRole('button', { name: 'Copy code' })).toBeNull()
  })

  it('treats a multi-line fence as a block even without a language', () => {
    render(<MarkdownContent content={'```\nline one\nline two\n```'} />)

    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument()
  })

  it('copies the code to the clipboard', async () => {
    const user = userEvent.setup()
    render(<MarkdownContent content={'```js\nconst x = 1\n```'} />)

    await user.click(screen.getByRole('button', { name: 'Copy code' }))

    await expect(navigator.clipboard.readText()).resolves.toBe('const x = 1')
  })

  it('renders nothing visible for empty content', () => {
    const { container } = render(<MarkdownContent content="" />)

    expect(container.textContent).toBe('')
  })
})
