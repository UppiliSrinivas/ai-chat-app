/**
 * When a guest should be asked to sign in. Kept pure and away from the banner
 * so the cadence is testable without rendering a conversation.
 */

/** Completed turns before the first ask, so there is something worth saving. */
export const TURNS_BEFORE_NUDGE = 2

/** Turns between a dismissal and the next ask. */
export const TURNS_BETWEEN_NUDGES = 5

export type NudgeContext = {
  turnCount: number
  /** Turn count when the guest last closed the banner, or null if never. */
  dismissedAtTurn: number | null
  isGuest: boolean
  isStreaming: boolean
}

export const shouldShowSaveNudge = ({
  turnCount,
  dismissedAtTurn,
  isGuest,
  isStreaming,
}: NudgeContext): boolean => {
  if (!isGuest) return false
  // Arriving mid-reply reads as something going wrong, not as an invitation.
  if (isStreaming) return false
  if (turnCount < TURNS_BEFORE_NUDGE) return false
  if (dismissedAtTurn === null) return true

  return turnCount - dismissedAtTurn >= TURNS_BETWEEN_NUDGES
}
