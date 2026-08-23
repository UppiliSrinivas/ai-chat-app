import { apiFetch } from './client'

export type ChatSummary = {
  id: string
  title: string
  projectId: string | null
  messageCount: number
  updatedAt: string
}

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ChatDetail = ChatSummary & { messages: ChatMessage[] }

export function createChat(projectId?: string): Promise<ChatSummary & { messages: [] }> {
  return apiFetch('/chats', {
    method: 'POST',
    body: JSON.stringify(projectId ? { projectId } : {}),
  })
}

export function listChats(): Promise<ChatSummary[]> {
  return apiFetch('/chats')
}

export function getChat(id: string): Promise<ChatDetail> {
  return apiFetch(`/chats/${id}`)
}

export function deleteChat(id: string): Promise<void> {
  return apiFetch(`/chats/${id}`, { method: 'DELETE' })
}
