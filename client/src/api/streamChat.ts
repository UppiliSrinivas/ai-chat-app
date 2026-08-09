import { API_BASE_URL } from './client'

type StreamChatParams = {
  chatId: string
  message: string
  onDelta: (delta: string) => void
  signal?: AbortSignal
}

export async function streamChat({ chatId, message, onDelta, signal }: StreamChatParams): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/gemini/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message }),
    signal,
  })

  if (!response.ok || !response.body) {
    throw new Error(`Chat request failed with status ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

      let separatorIndex = buffer.indexOf('\n\n')
      while (separatorIndex !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex)
        buffer = buffer.slice(separatorIndex + 2)
        if (handleEvent(rawEvent, onDelta) === 'done') return
        separatorIndex = buffer.indexOf('\n\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function handleEvent(rawEvent: string, onDelta: (delta: string) => void): 'done' | undefined {
  let eventType = 'message'
  const dataLines: string[] = []

  for (const line of rawEvent.split('\n')) {
    if (line.startsWith(':')) continue
    if (line.startsWith('event:')) {
      eventType = line.slice('event:'.length).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart())
    }
  }

  if (dataLines.length === 0) return undefined
  const data = dataLines.join('\n')

  if (eventType === 'error') {
    const parsed = JSON.parse(data) as { message?: string }
    throw new Error(parsed.message ?? 'The response stream failed')
  }

  if (data === '[DONE]') return 'done'

  const parsed = JSON.parse(data) as { delta?: string }
  if (parsed.delta) onDelta(parsed.delta)
  return undefined
}
