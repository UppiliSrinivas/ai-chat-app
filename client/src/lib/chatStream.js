const CHAT_ENDPOINT =
  import.meta.env.VITE_CHAT_ENDPOINT ?? 'http://localhost:5000/gemini/chat'

/**
 * Splits a raw SSE buffer into complete events, returning the parsed events and
 * whatever partial text is left over for the next chunk.
 */
const parseEvents = (buffer) => {
  const parts = buffer.split(/\r?\n\r?\n/)
  const remainder = parts.pop() ?? ''
  const events = []

  for (const part of parts) {
    let type = 'message'
    const dataLines = []

    for (const line of part.split(/\r?\n/)) {
      if (line.startsWith('event:')) {
        type = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''))
      }
    }

    // Per the SSE spec, multiple data: lines in one event join with a newline.
    const data = dataLines.join('\n').trim()
    if (data) {
      events.push({ type, data })
    }
  }

  return { events, remainder }
}

/**
 * Streams a chat completion, invoking `onDelta` with the full text so far as it
 * arrives. Resolves to `{ text, error }` rather than throwing, so callers can
 * stay free of try/catch — which also keeps them compilable by React Compiler.
 */
export const streamChat = async ({ message, history, signal, onDelta }) => {
  let text = ''

  try {
    const response = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ message, history }),
      signal,
    })

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('The response body is not available for streaming.')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let done = false

    while (!done) {
      const result = await reader.read()

      if (result.done) {
        buffer += decoder.decode()
        done = true
      } else {
        buffer += decoder.decode(result.value, { stream: true })
      }

      const parsed = parseEvents(buffer)
      buffer = parsed.remainder

      for (const event of parsed.events) {
        if (event.data === '[DONE]') {
          continue
        }

        let payload
        try {
          payload = JSON.parse(event.data)
        } catch {
          continue // Ignore malformed payloads rather than killing the stream.
        }

        // The server reports failures as a named error event, not an HTTP
        // status, because headers are flushed before the model is called.
        if (event.type === 'error') {
          throw new Error(payload.message || 'The server reported an error.')
        }

        if (typeof payload.delta === 'string') {
          text += payload.delta
          onDelta?.(text)
        }
      }
    }

    return { text, error: null }
  } catch (error) {
    if (error.name === 'AbortError') {
      return { text, error: null, aborted: true }
    }

    // Return the partial text alongside the error so a mid-stream failure
    // does not discard what already arrived.
    return { text, error: error.message }
  }
}
