import { useEffect, useState } from 'react'

/** Anything closer than this still counts as reading the newest content. Past
 *  it, the reader has deliberately gone looking for something earlier. */
const FOLLOW_THRESHOLD_PX = 80

type ScrollAnchor = {
  viewportRef: (node: HTMLDivElement | null) => void
  /** False once the reader scrolls away, which is when a "jump to latest"
   *  affordance is worth showing. */
  isPinned: boolean
  scrollToBottom: () => void
}

/**
 * Keeps a scroll container showing its newest content as that content grows,
 * and lets go the moment the reader scrolls away.
 *
 * `contentKey` has to change whenever the content gets taller. A streamed reply
 * grows without adding a message, so anything derived from a message count
 * alone never fires and the answer scrolls out of view.
 */
export function useScrollAnchor(contentKey: number): ScrollAnchor {
  // The viewport is state rather than a ref because it mounts late — the
  // container only exists once there is a first message — and an effect keyed
  // on a ref would have already run against null and never attached.
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const [isPinned, setIsPinned] = useState(true)

  const scrollToBottom = () => {
    if (!viewport) return

    viewport.scrollTop = viewport.scrollHeight
    setIsPinned(true)
  }

  // Jumps rather than animates: a smooth scroll restarts on every delta, so it
  // never reaches the bottom during a stream and visibly stutters instead.
  useEffect(() => {
    if (!viewport || !isPinned) return

    viewport.scrollTop = viewport.scrollHeight
  }, [viewport, contentKey, isPinned])

  useEffect(() => {
    if (!viewport) return

    const followIfAtBottom = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      setIsPinned(distanceFromBottom <= FOLLOW_THRESHOLD_PX)
    }

    viewport.addEventListener('scroll', followIfAtBottom, { passive: true })
    return () => viewport.removeEventListener('scroll', followIfAtBottom)
  }, [viewport])

  return { viewportRef: setViewport, isPinned, scrollToBottom }
}
