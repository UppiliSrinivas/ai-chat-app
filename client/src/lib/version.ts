/**
 * Build identity, baked in by Vite's `define` at build time — not read at
 * runtime. That is the whole point: a stale deployment reports the commit it
 * was built from rather than whatever the working tree is on now, which is the
 * only way a version check can catch a stale bundle.
 */

declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
export const APP_COMMIT = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'dev'

const SHORT_HASH_LENGTH = 7

// "dev" and "unknown" are words, not hashes — truncating them makes nonsense.
const shorten = (commit: string): string =>
  /^[0-9a-f]{8,40}$/i.test(commit) ? commit.slice(0, SHORT_HASH_LENGTH) : commit

export const formatVersion = (version: string, commit: string): string =>
  `v${version} · ${shorten(commit)}`
