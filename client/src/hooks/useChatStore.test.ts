import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_EDITS_PER_MESSAGE, useChatStore } from './useChatStore'
import { createChat, deleteChat, getChat, listChats } from '../api/chats'
import { streamChat } from '../api/streamChat'

vi.mock('../api/chats', () => ({
  createChat: vi.fn(),
  deleteChat: vi.fn(),
  getChat: vi.fn(),
  listChats: vi.fn(),
}))

vi.mock('../api/streamChat', () => ({ streamChat: vi.fn() }))

const initialState = {
  turns: [],
  isStreaming: false,
  streamingTurnId: null,
  error: null,
  chatId: null,
  chats: [],
  isLoadingChat: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  useChatStore.setState(initialState)
  vi.mocked(listChats).mockResolvedValue([])
  vi.mocked(createChat).mockResolvedValue({ id: 'chat-1', title: 'New chat', projectId: null, messageCount: 0, updatedAt: '', messages: [] })
  vi.mocked(streamChat).mockResolvedValue(undefined)
})

describe('sendMessage', () => {
  it('appends a turn and streams the reply into it', async () => {
    vi.mocked(streamChat).mockImplementation(async ({ onDelta }) => {
      onDelta('Hi ')
      onDelta('there')
    })

    await useChatStore.getState().sendMessage('hello')

    const { turns } = useChatStore.getState()
    expect(turns).toHaveLength(1)
    expect(turns[0].edits).toEqual(['hello'])
    expect(turns[0].responses).toEqual(['Hi there'])
  })

  it('creates the chat lazily on the first send only', async () => {
    await useChatStore.getState().sendMessage('first')
    await useChatStore.getState().sendMessage('second')

    expect(createChat).toHaveBeenCalledTimes(1)
    expect(useChatStore.getState().chatId).toBe('chat-1')
  })

  it('sends the chatId and message to the streaming endpoint', async () => {
    await useChatStore.getState().sendMessage('hello')

    expect(streamChat).toHaveBeenCalledWith(expect.objectContaining({ chatId: 'chat-1', message: 'hello' }))
  })

  it('clears the streaming flags once the stream finishes', async () => {
    await useChatStore.getState().sendMessage('hello')

    expect(useChatStore.getState()).toMatchObject({ isStreaming: false, streamingTurnId: null })
  })

  it('records the failure message but keeps the turn', async () => {
    vi.mocked(streamChat).mockRejectedValue(new Error('model exploded'))

    await useChatStore.getState().sendMessage('hello')

    expect(useChatStore.getState().error).toBe('model exploded')
    expect(useChatStore.getState().turns).toHaveLength(1)
  })

  it('keeps text already streamed when the stream fails partway', async () => {
    vi.mocked(streamChat).mockImplementation(async ({ onDelta }) => {
      onDelta('partial answer')
      throw new Error('connection lost')
    })

    await useChatStore.getState().sendMessage('hello')

    expect(useChatStore.getState().turns[0].responses[0]).toBe('partial answer')
  })

  it('ignores a send while another stream is in flight', async () => {
    useChatStore.setState({ isStreaming: true })

    await useChatStore.getState().sendMessage('hello')

    expect(useChatStore.getState().turns).toHaveLength(0)
    expect(streamChat).not.toHaveBeenCalled()
  })

  it('refreshes the chat list after streaming so the sidebar title updates', async () => {
    await useChatStore.getState().sendMessage('hello')

    expect(listChats).toHaveBeenCalled()
  })
})

describe('editMessage', () => {
  it('adds a new edit branch and makes it active', async () => {
    await useChatStore.getState().sendMessage('original')
    const turnId = useChatStore.getState().turns[0].id

    await useChatStore.getState().editMessage(turnId, 'edited')

    const turn = useChatStore.getState().turns[0]
    expect(turn.edits).toEqual(['original', 'edited'])
    expect(turn.activeEditIndex).toBe(1)
  })

  it('ignores an unknown turn id', async () => {
    await useChatStore.getState().sendMessage('original')
    vi.mocked(streamChat).mockClear()

    await useChatStore.getState().editMessage('does-not-exist', 'edited')

    expect(streamChat).not.toHaveBeenCalled()
  })

  it('stops accepting edits past MAX_EDITS_PER_MESSAGE', async () => {
    await useChatStore.getState().sendMessage('original')
    const turnId = useChatStore.getState().turns[0].id

    for (let i = 0; i < MAX_EDITS_PER_MESSAGE + 2; i += 1) {
      await useChatStore.getState().editMessage(turnId, `edit-${i}`)
    }

    expect(useChatStore.getState().turns[0].edits.length).toBeLessThanOrEqual(MAX_EDITS_PER_MESSAGE + 1)
  })
})

describe('navigateEdit', () => {
  it('moves between edit branches and clamps at both ends', async () => {
    await useChatStore.getState().sendMessage('original')
    const turnId = useChatStore.getState().turns[0].id
    await useChatStore.getState().editMessage(turnId, 'edited')

    useChatStore.getState().navigateEdit(turnId, 'prev')
    expect(useChatStore.getState().turns[0].activeEditIndex).toBe(0)

    useChatStore.getState().navigateEdit(turnId, 'prev')
    expect(useChatStore.getState().turns[0].activeEditIndex).toBe(0)

    useChatStore.getState().navigateEdit(turnId, 'next')
    expect(useChatStore.getState().turns[0].activeEditIndex).toBe(1)

    useChatStore.getState().navigateEdit(turnId, 'next')
    expect(useChatStore.getState().turns[0].activeEditIndex).toBe(1)
  })
})

describe('selectChat', () => {
  it('loads the chat and pairs each user message with the reply that follows', async () => {
    vi.mocked(getChat).mockResolvedValue({
      id: 'chat-9',
      title: 'Saved chat',
      projectId: null,
      messageCount: 4,
      updatedAt: '',
      messages: [
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'q2' },
        { role: 'assistant', content: 'a2' },
      ],
    })

    await useChatStore.getState().selectChat('chat-9')

    const { turns, chatId } = useChatStore.getState()
    expect(chatId).toBe('chat-9')
    expect(turns.map((turn) => [turn.edits[0], turn.responses[0]])).toEqual([
      ['q1', 'a1'],
      ['q2', 'a2'],
    ])
  })

  it('leaves a trailing user message with an empty reply', async () => {
    vi.mocked(getChat).mockResolvedValue({
      id: 'chat-9',
      title: 'Saved chat',
      projectId: null,
      messageCount: 1,
      updatedAt: '',
      messages: [{ role: 'user', content: 'unanswered' }],
    })

    await useChatStore.getState().selectChat('chat-9')

    expect(useChatStore.getState().turns[0].responses).toEqual([''])
  })

  it('records an error when the chat cannot be loaded', async () => {
    vi.mocked(getChat).mockRejectedValue(new Error('Not found'))

    await useChatStore.getState().selectChat('missing')

    expect(useChatStore.getState()).toMatchObject({ error: 'Not found', isLoadingChat: false })
  })

  it('ignores a reselect of the chat already open', async () => {
    useChatStore.setState({ chatId: 'chat-9' })

    await useChatStore.getState().selectChat('chat-9')

    expect(getChat).not.toHaveBeenCalled()
  })

  it('ignores a selection while streaming', async () => {
    useChatStore.setState({ isStreaming: true })

    await useChatStore.getState().selectChat('chat-9')

    expect(getChat).not.toHaveBeenCalled()
  })
})

describe('startNewChat', () => {
  it('clears the open chat so the next send creates a fresh one', () => {
    useChatStore.setState({ chatId: 'chat-1', turns: [{ id: 't', edits: ['x'], responses: ['y'], activeEditIndex: 0 }] })

    useChatStore.getState().startNewChat()

    expect(useChatStore.getState()).toMatchObject({ chatId: null, turns: [], error: null })
  })

  it('does nothing while streaming', () => {
    useChatStore.setState({ chatId: 'chat-1', isStreaming: true })

    useChatStore.getState().startNewChat()

    expect(useChatStore.getState().chatId).toBe('chat-1')
  })
})

describe('startNewChatInProject', () => {
  it('creates a chat inside the given project', async () => {
    await useChatStore.getState().startNewChatInProject('p1')

    expect(createChat).toHaveBeenCalledExactlyOnceWith('p1')
  })
})

describe('deleteChat', () => {
  it('removes the chat from the sidebar list', async () => {
    useChatStore.setState({
      chats: [
        { id: 'a', title: 'A', projectId: null, messageCount: 0, updatedAt: '' },
        { id: 'b', title: 'B', projectId: null, messageCount: 0, updatedAt: '' },
      ],
    })
    vi.mocked(deleteChat).mockResolvedValue(undefined)

    await useChatStore.getState().deleteChat('a')

    expect(useChatStore.getState().chats.map((chat) => chat.id)).toEqual(['b'])
  })

  it('also clears the view when the deleted chat was the open one', async () => {
    useChatStore.setState({
      chatId: 'a',
      turns: [{ id: 't', edits: ['x'], responses: ['y'], activeEditIndex: 0 }],
      chats: [{ id: 'a', title: 'A', projectId: null, messageCount: 0, updatedAt: '' }],
    })
    vi.mocked(deleteChat).mockResolvedValue(undefined)

    await useChatStore.getState().deleteChat('a')

    expect(useChatStore.getState()).toMatchObject({ chatId: null, turns: [] })
  })

  it('leaves the open chat alone when a different chat is deleted', async () => {
    useChatStore.setState({
      chatId: 'b',
      chats: [
        { id: 'a', title: 'A', projectId: null, messageCount: 0, updatedAt: '' },
        { id: 'b', title: 'B', projectId: null, messageCount: 0, updatedAt: '' },
      ],
    })
    vi.mocked(deleteChat).mockResolvedValue(undefined)

    await useChatStore.getState().deleteChat('a')

    expect(useChatStore.getState().chatId).toBe('b')
  })
})

describe('reset', () => {
  it('clears everything so the next user sees no trace of the previous session', () => {
    useChatStore.setState({
      chatId: 'a',
      turns: [{ id: 't', edits: ['x'], responses: ['y'], activeEditIndex: 0 }],
      chats: [{ id: 'a', title: 'A', projectId: null, messageCount: 0, updatedAt: '' }],
      error: 'stale',
      isStreaming: true,
      streamingTurnId: 't',
    })

    useChatStore.getState().reset()

    expect(useChatStore.getState()).toMatchObject({
      turns: [],
      chatId: null,
      chats: [],
      error: null,
      isStreaming: false,
      streamingTurnId: null,
    })
  })
})
