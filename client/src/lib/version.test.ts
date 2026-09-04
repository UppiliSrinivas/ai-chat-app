import { describe, expect, it } from 'vitest'
import { APP_COMMIT, APP_VERSION, formatVersion } from './version'

describe('formatVersion', () => {
  it('shows the version and the commit it was built from', () => {
    expect(formatVersion('1.2.3', 'a1b2c3d')).toBe('v1.2.3 · a1b2c3d')
  })

  // Vercel exposes the full 40-character SHA; the first seven identify a
  // commit just as well and fit in the sidebar.
  it('shortens a full commit hash', () => {
    expect(formatVersion('1.2.3', 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678')).toBe('v1.2.3 · a1b2c3d')
  })

  it('leaves an already-short hash alone', () => {
    expect(formatVersion('1.2.3', 'a1b2c3d')).toContain('a1b2c3d')
  })

  // Running from source, or a build with no git available — both are words,
  // not hashes, and truncating them would turn them into nonsense.
  it.each(['dev', 'unknown'])('leaves %s intact rather than truncating it', (commit) => {
    expect(formatVersion('1.2.3', commit)).toBe(`v1.2.3 · ${commit}`)
  })
})

describe('build constants', () => {
  // Baked in by Vite, so a stale bundle reports the commit it was built from
  // rather than whatever the working tree happens to be on now.
  it('always resolves to something printable', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(APP_COMMIT.length).toBeGreaterThan(0)
  })
})
