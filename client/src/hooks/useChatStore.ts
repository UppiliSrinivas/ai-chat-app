import { create } from 'zustand'
import { streamChat } from '../api/streamChat'
import { createChat } from '../api/chats'
import { ensureSession, type User } from '../api/auth'

export type Turn = {
  id: string
  edits: string[]
  responses: string[]
  activeEditIndex: number
}

export const MAX_EDITS_PER_MESSAGE = 5

type SessionStatus = 'idle' | 'loading' | 'ready'

type ChatState = {
  turns: Turn[]
  isStreaming: boolean
  streamingTurnId: string | null
  error: string | null
  chatId: string | null
  sessionStatus: SessionStatus
  user: User | null
  initSession: () => Promise<void>
  sendMessage: (content: string) => Promise<void>
  editMessage: (turnId: string, newContent: string) => Promise<void>
  navigateEdit: (turnId: string, direction: 'prev' | 'next') => void
  stopStreaming: () => void
}

let activeAbortController: AbortController | null = null

export const useChatStore = create<ChatState>((set, get) => {
  // Guest sessions are established lazily and idempotently here too, not
  // just from App's mount effect — this makes the store correct even if a
  // send happens before that effect has resolved.
  const ensureChatId = async (): Promise<string> => {
    const existing = get().chatId
    if (existing) return existing

    const user = await ensureSession()
    set({ user, sessionStatus: 'ready' })

    const chat = await createChat()
    set({ chatId: chat.id })
    return chat.id
  }

  const runStream = async (turnId: string, message: string) => {
    const controller = new AbortController()
    activeAbortController = controller
    set({ isStreaming: true, streamingTurnId: turnId, error: null })

    try {
      const chatId = await ensureChatId()
      await streamChat({
        chatId,
        message,
        signal: controller.signal,
        onDelta: (delta) => {
          set((state) => ({
            turns: state.turns.map((turn) => {
              if (turn.id !== turnId) return turn
              const responses = [...turn.responses]
              responses[turn.activeEditIndex] = (responses[turn.activeEditIndex] ?? '') + delta
              return { ...turn, responses }
            }),
          }))
        },
      })
    } catch (err) {
      if (!controller.signal.aborted) {
        set({ error: err instanceof Error ? err.message : 'Something went wrong' })
      }
    } finally {
      if (activeAbortController === controller) activeAbortController = null
      set({ isStreaming: false, streamingTurnId: null })
    }
  }

  return {
    turns: [],
    isStreaming: false,
    streamingTurnId: null,
    error: null,
    chatId: null,
    sessionStatus: 'idle',
    user: null,

    // Fired once from App on mount purely so the guest session is warm
    // before the user's first message — ensureChatId falls back to the
    // same logic on its own if this hasn't finished yet.
    initSession: async () => {
      if (get().sessionStatus !== 'idle') return
      set({ sessionStatus: 'loading' })
      try {
        const user = await ensureSession()
        set({ user, sessionStatus: 'ready' })
      } catch (err) {
        set({ sessionStatus: 'ready', error: err instanceof Error ? err.message : 'Could not start a session' })
      }
    },

    sendMessage: async (content) => {
      if (get().isStreaming) return
      const turn: Turn = { id: crypto.randomUUID(), edits: [content], responses: [''], activeEditIndex: 0 }
      set((state) => ({ turns: [...state.turns, turn] }))
      await runStream(turn.id, content)
    },

    // NOTE: the server now owns chat history and simply appends whatever it
    // receives — it has no concept of "this replaces an earlier turn." So an
    // edit still switches branches correctly in this UI, but the edited text
    // is persisted as an additional turn in Mongo, not a replacement. Future
    // model calls in this chat will see every edit attempt, not just the
    // one currently displayed. Flagging this rather than hiding it: fixing
    // it needs either a server-side "regenerate from turn N" endpoint or a
    // deliberate decision to leave edits client-only (unpersisted).
    editMessage: async (turnId, newContent) => {
      if (get().isStreaming) return
      const turns = get().turns
      const turnIndex = turns.findIndex((turn) => turn.id === turnId)
      if (turnIndex === -1) return
      if (turns[turnIndex].edits.length > MAX_EDITS_PER_MESSAGE) return

      const newEditIndex = turns[turnIndex].edits.length

      set((state) => ({
        turns: state.turns.map((turn) =>
          turn.id === turnId
            ? {
                ...turn,
                edits: [...turn.edits, newContent],
                responses: [...turn.responses, ''],
                activeEditIndex: newEditIndex,
              }
            : turn,
        ),
      }))
      await runStream(turnId, newContent)
    },

    navigateEdit: (turnId, direction) => {
      set((state) => ({
        turns: state.turns.map((turn) => {
          if (turn.id !== turnId) return turn
          const nextIndex = direction === 'prev' ? turn.activeEditIndex - 1 : turn.activeEditIndex + 1
          const clampedIndex = Math.max(0, Math.min(turn.edits.length - 1, nextIndex))
          return { ...turn, activeEditIndex: clampedIndex }
        }),
      }))
    },

    stopStreaming: () => {
      activeAbortController?.abort()
    },
  }
})
