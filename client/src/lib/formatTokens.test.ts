import { describe, expect, it } from 'vitest'
import { formatTokens } from './formatTokens'

describe('formatTokens', () => {
  it('leaves counts under a thousand alone', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(900)).toBe('900')
    expect(formatTokens(999)).toBe('999')
  })

  it('switches to K at a thousand', () => {
    expect(formatTokens(1_000)).toBe('1K')
    expect(formatTokens(2_400)).toBe('2.4K')
  })

  // Past ten of a unit the decimal is noise, so it is dropped.
  it('drops the decimal once there are ten or more of a unit', () => {
    expect(formatTokens(20_000)).toBe('20K')
    expect(formatTokens(19_950)).toBe('20K')
  })

  it('switches to M at a million', () => {
    expect(formatTokens(1_000_000)).toBe('1M')
    expect(formatTokens(1_240_000)).toBe('1.2M')
  })

  it('rounds a fractional count rather than showing it', () => {
    expect(formatTokens(12.6)).toBe('13')
  })

  // tokenCount is min:0 in the schema, but a bad payload should not render "-5".
  it('never renders a negative count', () => {
    expect(formatTokens(-5)).toBe('0')
  })
})
