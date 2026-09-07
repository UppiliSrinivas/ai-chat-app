import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom ships no matchMedia, so anything calling useMediaQuery throws without
// this. Defaults to "no match", i.e. the mobile-first branch; a test that
// needs desktop overrides `matches` for itself.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList
}

// jsdom has no ResizeObserver either. It never reports a resize here, so
// components keep whatever initial size they defaulted to — which is all the
// sign-in page needs to render its Google button.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }
}

// jsdom implements no scrolling, so the chat page's scroll-to-bottom effect
// throws without this.
Element.prototype.scrollIntoView = vi.fn()

afterEach(() => {
  cleanup()
})
