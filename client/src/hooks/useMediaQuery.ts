import { useSyncExternalStore } from 'react'

/**
 * Subscribes to a CSS media query from JS. Needed when a breakpoint has to
 * change behaviour rather than styling — an `inert` attribute, for instance,
 * can't be toggled by a `md:` class the way a CSS property can.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (onChange: () => void) => {
    const list = window.matchMedia(query)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // Server/prerender has no viewport; false matches the mobile-first default.
    () => false,
  )
}
