import { describe, expect, it } from 'vitest'
import { type NudgeContext, shouldShowSaveNudge, TURNS_BEFORE_NUDGE, TURNS_BETWEEN_NUDGES } from './nudge'

const context = (overrides: Partial<NudgeContext> = {}): NudgeContext => ({
  turnCount: TURNS_BEFORE_NUDGE,
  dismissedAtTurn: null,
  isGuest: true,
  isStreaming: false,
  ...overrides,
})

describe('shouldShowSaveNudge', () => {
  it('asks a guest once the chat is worth saving', () => {
    expect(shouldShowSaveNudge(context())).toBe(true)
  })

  it('never asks someone who is already signed in', () => {
    expect(shouldShowSaveNudge(context({ isGuest: false }))).toBe(false)
  })

  it('holds off until there are enough turns', () => {
    expect(shouldShowSaveNudge(context({ turnCount: TURNS_BEFORE_NUDGE - 1 }))).toBe(false)
  })

  it('stays quiet while a reply is still streaming', () => {
    expect(shouldShowSaveNudge(context({ isStreaming: true }))).toBe(false)
  })

  it('stays dismissed while the conversation has barely moved', () => {
    const dismissedAtTurn = TURNS_BEFORE_NUDGE

    expect(
      shouldShowSaveNudge(context({ dismissedAtTurn, turnCount: dismissedAtTurn + TURNS_BETWEEN_NUDGES - 1 })),
    ).toBe(false)
  })

  it('asks again once enough turns have passed since the dismissal', () => {
    const dismissedAtTurn = TURNS_BEFORE_NUDGE

    expect(
      shouldShowSaveNudge(context({ dismissedAtTurn, turnCount: dismissedAtTurn + TURNS_BETWEEN_NUDGES })),
    ).toBe(true)
  })

  // Signing in is what makes the banner irrelevant, and that can happen while
  // it is showing — the dismissal history must not outrank it.
  it('prefers being signed in over any dismissal state', () => {
    expect(shouldShowSaveNudge(context({ isGuest: false, turnCount: 100 }))).toBe(false)
  })
})
