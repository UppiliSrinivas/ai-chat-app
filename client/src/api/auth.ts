import { apiFetch } from './client'

export type User = {
  id: string
  email: string | null
  isAnonymous: boolean
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    return await apiFetch<User>('/auth/me')
  } catch {
    return null
  }
}

export function loginAsGuest(): Promise<User> {
  return apiFetch<User>('/auth/anonymous', { method: 'POST' })
}

// No login wall: every visitor gets a working guest session immediately,
// upgradeable to a real account later (not built yet).
export async function ensureSession(): Promise<User> {
  const existing = await getCurrentUser()
  if (existing) return existing
  return loginAsGuest()
}
