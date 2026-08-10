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

// `credential` is the ID token Google hands back to the client; the server
// verifies it against Google's keys before trusting anything in it.
export function loginWithGoogle(credential: string): Promise<User> {
  return apiFetch<User>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  })
}

export function logout(): Promise<void> {
  return apiFetch<void>('/auth/logout', { method: 'POST' })
}
