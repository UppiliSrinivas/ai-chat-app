import { apiFetch } from './client'

export type ChatSummary = {
  id: string
  title: string
  updatedAt: string
}

export function createChat(): Promise<ChatSummary & { messages: [] }> {
  return apiFetch('/chats', { method: 'POST', body: JSON.stringify({}) })
}
