import { apiFetch } from './client'

export type ChatSummary = {
  id: string
  title: string
  projectId: string | null
  messageCount: number
  tokenCount: number
  updatedAt: string
}

/** A file message has no text, only the upload it shows. */
export type ChatMessage =
  | { kind: 'text'; role: 'user' | 'assistant'; content: string }
  | { kind: 'file'; uploadId: string; name: string }

export type ChatDetail = ChatSummary & { messages: ChatMessage[] }

/** The server's flat shape stops here; a file message carries its name in `content`. */
type WireMessage = {
  role: 'user' | 'assistant'
  kind?: 'text' | 'file'
  content: string
  uploadId?: string | null
}

export const toChatMessage = ({ role, kind, content, uploadId }: WireMessage): ChatMessage => {
  if (kind === 'file' && uploadId) return { kind: 'file', uploadId, name: content }
  return { kind: 'text', role, content }
}

export function createChat(projectId?: string): Promise<ChatSummary & { messages: [] }> {
  return apiFetch('/chats', {
    method: 'POST',
    body: JSON.stringify(projectId ? { projectId } : {}),
  })
}

export function listChats(): Promise<ChatSummary[]> {
  return apiFetch('/chats')
}

export async function getChat(id: string): Promise<ChatDetail> {
  const chat = await apiFetch<ChatSummary & { messages: WireMessage[] }>(`/chats/${id}`)
  return { ...chat, messages: chat.messages.map(toChatMessage) }
}

export function deleteChat(id: string): Promise<void> {
  return apiFetch(`/chats/${id}`, { method: 'DELETE' })
}
