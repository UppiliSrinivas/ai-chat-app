import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamChat } from './streamChat'

/** Simulates a fetch response body arriving as separate network chunks,
 *  independent of where SSE event boundaries fall. */
function fakeBody(chunks: string[]) {
  const encoder = new TextEncoder()
  let index = 0
  return {
    getReader() {
      return {
        async read() {
          if (index >= chunks.length) return { done: true, value: undefined }
          const value = encoder.encode(chunks[index])
          index += 1
          return { done: false, value }
        },
        releaseLock() {},
      }
    },
  }
}

const mockFetchWithBody = (chunks: string[], overrides: Partial<{ ok: boolean; status: number }> = {}) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, body: fakeBody(chunks), ...overrides })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('streamChat', () => {
  it('delivers a delta and resolves on [DONE]', async () => {
    mockFetchWithBody(['data: {"delta":"Hello"}\n\n', 'data: [DONE]\n\n'])
    const onDelta = vi.fn()

    await streamChat({ chatId: 'c1', message: 'hi', onDelta })

    expect(onDelta).toHaveBeenCalledTimes(1)
    expect(onDelta).toHaveBeenCalledWith('Hello')
  })

  it('delivers multiple deltas in order', async () => {
    mockFetchWithBody(['data: {"delta":"Hel"}\n\n', 'data: {"delta":"lo"}\n\n', 'data: [DONE]\n\n'])
    const onDelta = vi.fn()

    await streamChat({ chatId: 'c1', message: 'hi', onDelta })

    expect(onDelta.mock.calls.map((call) => call[0])).toEqual(['Hel', 'lo'])
  })

  it('reassembles a single event split across chunk boundaries', async () => {
    mockFetchWithBody(['data: {"del', 'ta":"Hello"}\n', '\ndata: [DONE]\n\n'])
    const onDelta = vi.fn()

    await streamChat({ chatId: 'c1', message: 'hi', onDelta })

    expect(onDelta).toHaveBeenCalledExactlyOnceWith('Hello')
  })

  it('handles CRLF frame delimiters', async () => {
    mockFetchWithBody(['data: {"delta":"Hi"}\r\n\r\n', 'data: [DONE]\r\n\r\n'])
    const onDelta = vi.fn()

    await streamChat({ chatId: 'c1', message: 'hi', onDelta })

    expect(onDelta).toHaveBeenCalledExactlyOnceWith('Hi')
  })

  it('ignores comment/keepalive frames', async () => {
    mockFetchWithBody([': keepalive\n\n', 'data: {"delta":"ok"}\n\n', ': keepalive\n\n', 'data: [DONE]\n\n'])
    const onDelta = vi.fn()

    await streamChat({ chatId: 'c1', message: 'hi', onDelta })

    expect(onDelta).toHaveBeenCalledExactlyOnceWith('ok')
  })

  it('joins a multi-line data: field before parsing it as JSON', async () => {
    mockFetchWithBody(['data: {"delta":\ndata: "ok"}\n\n', 'data: [DONE]\n\n'])
    const onDelta = vi.fn()

    await streamChat({ chatId: 'c1', message: 'hi', onDelta })

    expect(onDelta).toHaveBeenCalledExactlyOnceWith('ok')
  })

  it('rejects with the server-provided message on an error event', async () => {
    mockFetchWithBody(['event: error\ndata: {"message":"model exploded"}\n\n'])
    const onDelta = vi.fn()

    await expect(streamChat({ chatId: 'c1', message: 'hi', onDelta })).rejects.toThrow('model exploded')
    expect(onDelta).not.toHaveBeenCalled()
  })

  it('throws when the response is not ok', async () => {
    mockFetchWithBody([], { ok: false, status: 500 })

    await expect(streamChat({ chatId: 'c1', message: 'hi', onDelta: vi.fn() })).rejects.toThrow(
      'Chat request failed with status 500',
    )
  })
})
