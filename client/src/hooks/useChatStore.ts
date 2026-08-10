import { create } from 'zustand'
import { streamChat } from '../api/streamChat'
import { createChat, deleteChat as deleteChatRequest, getChat, listChats, type ChatMessage, type ChatSummary } from '../api/chats'

export type Turn = {
  id: string
  edits: string[]
  responses: string[]
  activeEditIndex: number
}

export const MAX_EDITS_PER_MESSAGE = 5

// The server stores one flat message list; edits/branches are a client-only
// concept (see the NOTE in editMessage below), so a reload just pairs each
// user message with the assistant reply that follows it.
function messagesToTurns(messages: ChatMessage[]): Turn[] {
  const turns: Turn[] = []
  for (const message of messages) {
    if (message.role === 'user') {
      turns.push({ id: crypto.randomUUID(), edits: [message.content], responses: [''], activeEditIndex: 0 })
    } else if (turns.length > 0) {
      const lastTurn = turns[turns.length - 1]
      lastTurn.responses[lastTurn.activeEditIndex] = message.content
    }
  }
  return turns
}

type ChatState = {
  turns: Turn[]
  isStreaming: boolean
  streamingTurnId: string | null
  error: string | null
  chatId: string | null
  chats: ChatSummary[]
  isLoadingChat: boolean
  sendMessage: (content: string) => Promise<void>
  editMessage: (turnId: string, newContent: string) => Promise<void>
  navigateEdit: (turnId: string, direction: 'prev' | 'next') => void
  stopStreaming: () => void
  loadChats: () => Promise<void>
  selectChat: (chatId: string) => Promise<void>
  startNewChat: () => void
  deleteChat: (chatId: string) => Promise<void>
  reset: () => void
}

let activeAbortController: AbortController | null = null

export const useChatStore = create<ChatState>((set, get) => {
  // The chat is created on first send rather than on mount, so opening the
  // app without saying anything doesn't litter empty chats in the database.
  const ensureChatId = async (): Promise<string> => {
    const existing = get().chatId
    if (existing) return existing

    const chat = await createChat()
    set({ chatId: chat.id })
    get().loadChats()
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
      // Refreshes title (server derives it from the first message) and
      // moves this chat to the top of the sidebar's updatedAt ordering.
      get().loadChats()
    }
  }

  return {
    turns: [],
    isStreaming: false,
    streamingTurnId: null,
    error: null,
    chatId: null,
    chats: [],
    isLoadingChat: false,

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

    loadChats: async () => {
      const chats = await listChats()
      set({ chats })
    },

    selectChat: async (chatId) => {
      if (get().isStreaming || get().chatId === chatId) return
      set({ isLoadingChat: true, error: null })
      try {
        const chat = await getChat(chatId)
        set({ chatId: chat.id, turns: messagesToTurns(chat.messages) })
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'Could not load that chat' })
      } finally {
        set({ isLoadingChat: false })
      }
    },

    startNewChat: () => {
      if (get().isStreaming) return
      set({ chatId: null, turns: [], error: null })
    },

    deleteChat: async (chatId) => {
      await deleteChatRequest(chatId)
      set((state) => ({
        chats: state.chats.filter((chat) => chat.id !== chatId),
        ...(state.chatId === chatId ? { chatId: null, turns: [] } : {}),
      }))
    },

    // Called on sign-out so the next user never sees the previous one's
    // messages still on screen.
    reset: () => {
      activeAbortController?.abort()
      set({ turns: [], chatId: null, chats: [], error: null, isStreaming: false, streamingTurnId: null })
    },
  }
})
