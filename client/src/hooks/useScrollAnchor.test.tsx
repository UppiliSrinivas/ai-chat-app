import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useScrollAnchor } from './useScrollAnchor'

/**
 * jsdom does no layout: scrollHeight and clientHeight are always 0 and scrollTop
 * never moves. Each is replaced here so the hook sees a viewport with real
 * dimensions it can reason about.
 */
const sizeViewport = (viewport: HTMLElement, scrollHeight: number, clientHeight: number) => {
  let scrollTop = 0
  Object.defineProperty(viewport, 'scrollHeight', { value: scrollHeight, configurable: true })
  Object.defineProperty(viewport, 'clientHeight', { value: clientHeight, configurable: true })
  Object.defineProperty(viewport, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value
    },
  })
}

// A harness rather than renderHook: the hook attaches its scroll listener in an
// effect, so the ref has to be on a real element before effects run.
function ScrollHarness({ contentKey }: { contentKey: number }) {
  const { viewportRef, isPinned, scrollToBottom } = useScrollAnchor(contentKey)

  return (
    <>
      <div data-testid="viewport" ref={viewportRef} />
      <output>{isPinned ? 'following' : 'released'}</output>
      <button type="button" onClick={scrollToBottom}>
        Jump to latest
      </button>
    </>
  )
}

const scrollTo = (viewport: HTMLElement, position: number) => {
  viewport.scrollTop = position
  fireEvent.scroll(viewport)
}

describe('useScrollAnchor', () => {
  it('follows content that grows while the reader is at the bottom', () => {
    const { rerender } = render(<ScrollHarness contentKey={0} />)
    const viewport = screen.getByTestId('viewport')
    sizeViewport(viewport, 1000, 400)

    rerender(<ScrollHarness contentKey={1} />)

    expect(viewport.scrollTop).toBe(1000)
  })

  // The whole point: a streamed reply grows without adding a message, and the
  // reader who scrolled up to read something must not be yanked back down.
  it('stops following once the reader scrolls away', () => {
    const { rerender } = render(<ScrollHarness contentKey={0} />)
    const viewport = screen.getByTestId('viewport')
    sizeViewport(viewport, 1000, 400)

    scrollTo(viewport, 200)
    expect(screen.getByText('released')).toBeInTheDocument()

    rerender(<ScrollHarness contentKey={1} />)

    expect(viewport.scrollTop).toBe(200)
  })

  it('follows again once the reader returns to the bottom', () => {
    render(<ScrollHarness contentKey={0} />)
    const viewport = screen.getByTestId('viewport')
    sizeViewport(viewport, 1000, 400)

    scrollTo(viewport, 200)
    expect(screen.getByText('released')).toBeInTheDocument()

    // 1000 - 560 - 400 = 40px from the bottom, inside the threshold.
    scrollTo(viewport, 560)

    expect(screen.getByText('following')).toBeInTheDocument()
  })

  it('re-pins and jumps to the bottom on demand', async () => {
    const user = userEvent.setup()
    render(<ScrollHarness contentKey={0} />)
    const viewport = screen.getByTestId('viewport')
    sizeViewport(viewport, 1000, 400)

    scrollTo(viewport, 0)
    expect(screen.getByText('released')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Jump to latest' }))

    expect(viewport.scrollTop).toBe(1000)
    expect(screen.getByText('following')).toBeInTheDocument()
  })
})
