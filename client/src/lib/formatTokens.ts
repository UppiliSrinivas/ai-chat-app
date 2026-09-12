/** Compact token counts for the composer footer: 900, 2.4K, 1.2M. */

const UNITS = [
  { limit: 1_000_000, suffix: 'M' },
  { limit: 1_000, suffix: 'K' },
] as const

/** A decimal only below ten of a unit, so "2.4K" stays readable while "20K"
 *  doesn't carry a digit nobody reads. */
const trimTrailingZero = (value: string): string => value.replace(/\.0$/, '')

export function formatTokens(count: number): string {
  const whole = Math.max(0, Math.round(count))
  const unit = UNITS.find(({ limit }) => whole >= limit)
  if (!unit) return String(whole)

  const scaled = whole / unit.limit
  const digits = scaled < 10 ? 1 : 0
  return `${trimTrailingZero(scaled.toFixed(digits))}${unit.suffix}`
}
