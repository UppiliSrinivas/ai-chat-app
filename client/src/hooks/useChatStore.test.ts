import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_EDITS_PER_MESSAGE, useChatStore, type TextTurn } from './useChatStore'
import { useAuthStore } from './useAuthStore'
import { createChat, deleteChat, getChat, listChats } from '../api/chats'
import { listProjects } from '../api/projects'
import { streamChat, type ToolActivity } from '../api/streamChat'
import { uploadFile } from '../api/uploads'
import { useUploadStore } from './useUploadStore'
import { MAX_UPLOAD_BYTES } from '../lib/limits'

vi.mock('../api/chats', () => ({
  createChat: vi.fn(),
  deleteChat: vi.fn(),
  getChat: vi.fn(),
  listChats: vi.fn(),
}))

vi.mock('../api/streamChat', () => ({ streamChat: vi.fn() }))

vi.mock('../api/uploads', () => ({ uploadFile: vi.fn(), getUpload: vi.fn(), listUploads: vi.fn() }))

// The store refreshes project chat counts after a chat is created or deleted;
// stubbing the API keeps that off the network.
vi.mock('../api/projects', () => ({
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  listProjects: vi.fn().mockResolvedValue([]),
  renameProject: vi.fn(),
}))

/** The nth turn, asserted to be a text turn so its edits and replies can be read. */
const textTurn = (index = 0): TextTurn => {
  const turn = useChatStore.getState().turns[index]
  if (turn?.kind !== 'text') throw new Error(`turn ${index} is not a text turn`)
  return turn
}

const initialState = {
  turns: [],
  isStreaming: false,
  streamingTurnId: null,
  error: null,
  chatId: null,
  chats: [],
  isLoadingChat: false,
  pendingProjectId: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  useChatStore.setState(initialState)
  vi.mocked(listChats).mockResolvedValue([])
  vi.mocked(createChat).mockResolvedValue({ id: 'chat-1', title: 'New chat', projectId: null, messageCount: 0, tokenCount: 0, updatedAt: '', messages: [] })
  vi.mocked(streamChat).mockResolvedValue(undefined)
  vi.mocked(listProjects).mockResolvedValue([])
  // Every first send now mints a guest account; stubbing it keeps these tests
  // about the chat, and off the network.
  useAuthStore.setState({ ensureSession: vi.fn() })
})

describe('sendMessage', () => {
  // The chat belongs to a user, so the account has to exist before it does.
  it('creates the guest account before the chat', async () => {
    const order: string[] = []
    useAuthStore.setState({
      ensureSession: vi.fn(async () => {
        order.push('session')
      }),
    })
    vi.mocked(createChat).mockImplementation(async () => {
      order.push('chat')
      return { id: 'chat-1', title: 'New chat', projectId: null, messageCount: 0, tokenCount: 0, updatedAt: '', messages: [] }
    })

    await useChatStore.getState().sendMessage('hi')

    expect(order).toEqual(['session', 'chat'])
  })

  it('reports why a send failed when the guest account cannot be created', async () => {
    useAuthStore.setState({
      ensureSession: vi.fn().mockRejectedValue(new Error('Server unavailable')),
    })

    await useChatStore.getState().sendMessage('hi')

    expect(useChatStore.getState().error).toBe('Server unavailable')
    expect(useChatStore.getState().turns).toHaveLength(1)
  })

  it('appends a turn and streams the reply into it', async () => {
    vi.mocked(streamChat).mockImplementation(async ({ onDelta }) => {
      onDelta('Hi ')
      onDelta('there')
    })

    await useChatStore.getState().sendMessage('hello')

    expect(useChatStore.getState().turns).toHaveLength(1)
    expect(textTurn().edits).toEqual(['hello'])
    expect(textTurn().responses).toEqual(['Hi there'])
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

    expect(textTurn().responses[0]).toBe('partial answer')
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

  // The sidebar's "3/10" badge and its "+ New chat" / "+ New project" swap both
  // read chatCount, so they go stale for the session without this.
  it('refreshes project counts once the chat exists', async () => {
    await useChatStore.getState().sendMessage('hello')

    expect(listProjects).toHaveBeenCalled()
  })
})

describe('editMessage', () => {
  it('adds a new edit branch and makes it active', async () => {
    await useChatStore.getState().sendMessage('original')
    const turnId = useChatStore.getState().turns[0].id

    await useChatStore.getState().editMessage(turnId, 'edited')

    const turn = textTurn()
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

    expect(textTurn().edits.length).toBeLessThanOrEqual(MAX_EDITS_PER_MESSAGE + 1)
  })
})

describe('navigateEdit', () => {
  it('moves between edit branches and clamps at both ends', async () => {
    await useChatStore.getState().sendMessage('original')
    const turnId = useChatStore.getState().turns[0].id
    await useChatStore.getState().editMessage(turnId, 'edited')

    useChatStore.getState().navigateEdit(turnId, 'prev')
    expect(textTurn().activeEditIndex).toBe(0)

    useChatStore.getState().navigateEdit(turnId, 'prev')
    expect(textTurn().activeEditIndex).toBe(0)

    useChatStore.getState().navigateEdit(turnId, 'next')
    expect(textTurn().activeEditIndex).toBe(1)

    useChatStore.getState().navigateEdit(turnId, 'next')
    expect(textTurn().activeEditIndex).toBe(1)
  })
})

describe('selectChat', () => {
  it('loads the chat and pairs each user message with the reply that follows', async () => {
    vi.mocked(getChat).mockResolvedValue({
      id: 'chat-9',
      title: 'Saved chat',
      projectId: null,
      messageCount: 4, tokenCount: 0,
      updatedAt: '',
      messages: [
        { kind: 'text', role: 'user', content: 'q1' },
        { kind: 'text', role: 'assistant', content: 'a1' },
        { kind: 'text', role: 'user', content: 'q2' },
        { kind: 'text', role: 'assistant', content: 'a2' },
      ],
    })

    await useChatStore.getState().selectChat('chat-9')

    const { turns, chatId } = useChatStore.getState()
    expect(chatId).toBe('chat-9')
    expect(turns.filter((turn): turn is TextTurn => turn.kind === 'text').map((turn) => [turn.edits[0], turn.responses[0]])).toEqual([
      ['q1', 'a1'],
      ['q2', 'a2'],
    ])
  })

  it('leaves a trailing user message with an empty reply', async () => {
    vi.mocked(getChat).mockResolvedValue({
      id: 'chat-9',
      title: 'Saved chat',
      projectId: null,
      messageCount: 1, tokenCount: 0,
      updatedAt: '',
      messages: [{ kind: 'text', role: 'user', content: 'unanswered' }],
    })

    await useChatStore.getState().selectChat('chat-9')

    expect(textTurn().responses).toEqual([''])
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
    useChatStore.setState({ chatId: 'chat-1', turns: [{ kind: 'text' as const, id: 't', edits: ['x'], responses: ['y'], activeEditIndex: 0 }] })

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
  // Creating eagerly would leave a permanent empty chat — and burn one of the
  // project's ten slots — for anyone who clicks and then walks away.
  it('creates no chat until the first message is sent', () => {
    useChatStore.getState().startNewChatInProject('p1')

    expect(createChat).not.toHaveBeenCalled()
    expect(useChatStore.getState()).toMatchObject({ chatId: null, turns: [], pendingProjectId: 'p1' })
  })

  it('creates the chat inside that project on the first send', async () => {
    useChatStore.getState().startNewChatInProject('p1')

    await useChatStore.getState().sendMessage('hello')

    expect(createChat).toHaveBeenCalledExactlyOnceWith('p1')
    expect(useChatStore.getState().pendingProjectId).toBeNull()
  })

  it('does nothing while streaming', () => {
    useChatStore.setState({ chatId: 'chat-1', isStreaming: true })

    useChatStore.getState().startNewChatInProject('p1')

    expect(useChatStore.getState()).toMatchObject({ chatId: 'chat-1', pendingProjectId: null })
  })

  it('is abandoned by starting a loose new chat', () => {
    useChatStore.getState().startNewChatInProject('p1')

    useChatStore.getState().startNewChat()

    expect(useChatStore.getState().pendingProjectId).toBeNull()
  })

  it('is abandoned by opening an existing chat', async () => {
    vi.mocked(getChat).mockResolvedValue({
      id: 'chat-9',
      title: 'Saved chat',
      projectId: null,
      messageCount: 0, tokenCount: 0,
      updatedAt: '',
      messages: [],
    })
    useChatStore.getState().startNewChatInProject('p1')

    await useChatStore.getState().selectChat('chat-9')

    expect(useChatStore.getState().pendingProjectId).toBeNull()
  })
})

describe('deleteChat', () => {
  it('removes the chat from the sidebar list', async () => {
    useChatStore.setState({
      chats: [
        { id: 'a', title: 'A', projectId: null, messageCount: 0, tokenCount: 0, updatedAt: '' },
        { id: 'b', title: 'B', projectId: null, messageCount: 0, tokenCount: 0, updatedAt: '' },
      ],
    })
    vi.mocked(deleteChat).mockResolvedValue(undefined)

    await useChatStore.getState().deleteChat('a')

    expect(useChatStore.getState().chats.map((chat) => chat.id)).toEqual(['b'])
  })

  it('also clears the view when the deleted chat was the open one', async () => {
    useChatStore.setState({
      chatId: 'a',
      turns: [{ kind: 'text' as const, id: 't', edits: ['x'], responses: ['y'], activeEditIndex: 0 }],
      chats: [{ id: 'a', title: 'A', projectId: null, messageCount: 0, tokenCount: 0, updatedAt: '' }],
    })
    vi.mocked(deleteChat).mockResolvedValue(undefined)

    await useChatStore.getState().deleteChat('a')

    expect(useChatStore.getState()).toMatchObject({ chatId: null, turns: [] })
  })

  it('refreshes project counts, since the chat may have been inside one', async () => {
    useChatStore.setState({ chats: [{ id: 'a', title: 'A', projectId: 'p1', messageCount: 0, tokenCount: 0, updatedAt: '' }] })
    vi.mocked(deleteChat).mockResolvedValue(undefined)

    await useChatStore.getState().deleteChat('a')

    expect(listProjects).toHaveBeenCalled()
  })

  it('leaves the open chat alone when a different chat is deleted', async () => {
    useChatStore.setState({
      chatId: 'b',
      chats: [
        { id: 'a', title: 'A', projectId: null, messageCount: 0, tokenCount: 0, updatedAt: '' },
        { id: 'b', title: 'B', projectId: null, messageCount: 0, tokenCount: 0, updatedAt: '' },
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
      turns: [{ kind: 'text' as const, id: 't', edits: ['x'], responses: ['y'], activeEditIndex: 0 }],
      chats: [{ id: 'a', title: 'A', projectId: null, messageCount: 0, tokenCount: 0, updatedAt: '' }],
      error: 'stale',
      isStreaming: true,
      streamingTurnId: 't',
      pendingProjectId: 'p1',
    })

    useChatStore.getState().reset()

    expect(useChatStore.getState()).toMatchObject({
      turns: [],
      chatId: null,
      chats: [],
      error: null,
      isStreaming: false,
      streamingTurnId: null,
      pendingProjectId: null,
    })
  })
})

describe('tool activity', () => {
  const running: ToolActivity = {
    id: 'call_1',
    name: 'getWeather',
    status: 'running',
    label: 'Checking the weather in Chennai',
  }

  it('collects each tool the reply reports', async () => {
    const seen: ToolActivity[] = []
    vi.mocked(streamChat).mockImplementation(async ({ onTool }) => {
      onTool?.(running)
      onTool?.({ ...running, id: 'call_2', label: 'Checking the weather in Mumbai' })
      seen.push(...useChatStore.getState().activeTools)
    })

    await useChatStore.getState().sendMessage('compare Delhi and Mumbai')

    expect(seen.map((tool) => tool.id)).toEqual(['call_1', 'call_2'])
  })

  // The same call reports twice — running, then done — and must not stack up.
  it('replaces a tool report rather than appending a second one', async () => {
    let duringStream: ToolActivity[] = []
    vi.mocked(streamChat).mockImplementation(async ({ onTool }) => {
      onTool?.(running)
      onTool?.({ ...running, status: 'done' })
      duringStream = useChatStore.getState().activeTools
    })

    await useChatStore.getState().sendMessage('weather?')

    expect(duringStream).toHaveLength(1)
    expect(duringStream[0]?.status).toBe('done')
  })

  it('clears the tool list once the reply finishes', async () => {
    vi.mocked(streamChat).mockImplementation(async ({ onTool }) => {
      onTool?.(running)
    })

    await useChatStore.getState().sendMessage('weather?')

    expect(useChatStore.getState().activeTools).toEqual([])
  })
})

describe('file turns', () => {
  const readyUpload = { id: 'u1', name: 'cv.pdf', sizeBytes: 1024, createdAt: '', status: 'ready' as const, chunkCount: 2 }
  const pdf = new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' })

  beforeEach(() => {
    useUploadStore.getState().reset()
    vi.mocked(uploadFile).mockResolvedValue(readyUpload)
  })

  it('loads a saved file message as a file turn, pairing the reply with the question after it', async () => {
    vi.mocked(getChat).mockResolvedValue({
      id: 'chat-9',
      title: 'cv.pdf',
      projectId: null,
      messageCount: 3,
      tokenCount: 0,
      updatedAt: '',
      messages: [
        { kind: 'file', uploadId: 'u1', name: 'cv.pdf' },
        { kind: 'text', role: 'user', content: 'Summarize it' },
        { kind: 'text', role: 'assistant', content: 'A full-stack CV.' },
      ],
    })

    await useChatStore.getState().selectChat('chat-9')

    const [file, question] = useChatStore.getState().turns
    expect(file).toMatchObject({ kind: 'file', uploadId: 'u1', name: 'cv.pdf' })
    expect(question).toMatchObject({ kind: 'text', edits: ['Summarize it'], responses: ['A full-stack CV.'] })
  })

  // A file can open a conversation, so the chat has to exist before the upload.
  it('creates the chat first, then uploads the file into it', async () => {
    await useChatStore.getState().attachFile(pdf)

    expect(createChat).toHaveBeenCalledOnce()
    expect(uploadFile).toHaveBeenCalledExactlyOnceWith('chat-1', pdf)
    expect(useChatStore.getState().turns).toEqual([
      { kind: 'file', id: expect.any(String), uploadId: 'u1', name: 'cv.pdf' },
    ])
  })

  it('hands the upload to the upload store so its status is tracked', async () => {
    await useChatStore.getState().attachFile(pdf)

    expect(useUploadStore.getState().uploadsByChat['chat-1']).toEqual([readyUpload])
  })

  it('refreshes the chat list, since a file can title a new chat', async () => {
    await useChatStore.getState().attachFile(pdf)

    expect(listChats).toHaveBeenCalled()
  })

  it('refuses an oversized file without creating a chat or uploading', async () => {
    const huge = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'huge.pdf')

    await useChatStore.getState().attachFile(huge)

    expect(createChat).not.toHaveBeenCalled()
    expect(uploadFile).not.toHaveBeenCalled()
    expect(useChatStore.getState().error).toMatch(/huge\.pdf/)
  })

  it("shows the server's reason when the upload is refused", async () => {
    vi.mocked(uploadFile).mockRejectedValue(new Error('A chat can hold 10 files.'))

    await useChatStore.getState().attachFile(pdf)

    expect(useChatStore.getState().error).toBe('A chat can hold 10 files.')
    expect(useChatStore.getState().turns).toEqual([])
  })

  it('does nothing while a reply is streaming', async () => {
    useChatStore.setState({ isStreaming: true })

    await useChatStore.getState().attachFile(pdf)

    expect(uploadFile).not.toHaveBeenCalled()
  })

  // The upload still belongs to its chat; it just mustn't appear in this one.
  it('does not add the file to a different chat the user switched to', async () => {
    useChatStore.setState({ chatId: 'chat-1' })
    vi.mocked(uploadFile).mockImplementation(async () => {
      useChatStore.setState({ chatId: 'chat-2', turns: [] })
      return readyUpload
    })

    await useChatStore.getState().attachFile(pdf)

    expect(useChatStore.getState().turns).toEqual([])
  })

  it('ignores an edit aimed at a file turn', async () => {
    const fileTurn = { kind: 'file' as const, id: 'f', uploadId: 'u1', name: 'cv.pdf' }
    useChatStore.setState({ chatId: 'chat-1', turns: [fileTurn] })

    await useChatStore.getState().editMessage('f', 'new text')
    useChatStore.getState().navigateEdit('f', 'next')

    expect(useChatStore.getState().turns).toEqual([fileTurn])
    expect(streamChat).not.toHaveBeenCalled()
  })
})
