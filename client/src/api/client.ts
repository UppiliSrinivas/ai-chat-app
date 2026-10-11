export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000'

/** Carries the server's `code` next to its message, so callers can branch on
 *  which 409 they got rather than matching the text. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(message: string, status: number, code: string | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** Shared fetch wrapper: always sends the session cookie, always parses
 *  JSON, and turns a non-2xx response into a thrown ApiError. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // A file upload's multipart header carries a boundary only the browser knows,
  // so it must be left for the browser to set.
  const isFormData = init?.body instanceof FormData
  const contentType: Record<string, string> = isFormData ? {} : { 'Content-Type': 'application/json' }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...contentType, ...init?.headers },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message = body?.message ?? `Request failed with status ${response.status}`
    throw new ApiError(message, response.status, body?.code ?? null)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
