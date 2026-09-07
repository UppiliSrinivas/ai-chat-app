import { useEffect, useState } from 'react'
import { ArrowDown, Menu } from 'lucide-react'
import Composer from '../../components/composser'
import Message from '../../components/message'
import ChatSidebar from '../../components/sidebar/ChatSidebar'
import { useAuthStore } from '../../hooks/useAuthStore'
import { useChatStore } from '../../hooks/useChatStore'
import { useProjectStore } from '../../hooks/useProjectStore'
import { useScrollAnchor } from '../../hooks/useScrollAnchor'
import { MAX_CHAT_TOKENS } from '../../lib/limits'

export default function ChatPage() {
    const turns = useChatStore((state) => state.turns)
    const isStreaming = useChatStore((state) => state.isStreaming)
    const streamingTurnId = useChatStore((state) => state.streamingTurnId)
    const error = useChatStore((state) => state.error)
    const chatId = useChatStore((state) => state.chatId)
    const chats = useChatStore((state) => state.chats)
    const sendMessage = useChatStore((state) => state.sendMessage)
    const editMessage = useChatStore((state) => state.editMessage)
    const navigateEdit = useChatStore((state) => state.navigateEdit)
    const stopStreaming = useChatStore((state) => state.stopStreaming)
    const loadChats = useChatStore((state) => state.loadChats)
    const selectChat = useChatStore((state) => state.selectChat)
    const startNewChat = useChatStore((state) => state.startNewChat)
    const startNewChatInProject = useChatStore((state) => state.startNewChatInProject)
    const deleteChat = useChatStore((state) => state.deleteChat)
    const pendingProjectId = useChatStore((state) => state.pendingProjectId)
    const user = useAuthStore((state) => state.user)
    const signOut = useAuthStore((state) => state.signOut)
    const startUpgrade = useAuthStore((state) => state.startUpgrade)
    const projects = useProjectStore((state) => state.projects)
    const projectError = useProjectStore((state) => state.error)
    const loadProjects = useProjectStore((state) => state.loadProjects)
    const addProject = useProjectStore((state) => state.addProject)
    const renameProject = useProjectStore((state) => state.renameProject)
    const removeProject = useProjectStore((state) => state.removeProject)

    const [isSidebarOpen, setIsSidebarOpen] = useState(false)

    // Grows as a reply streams, not only when a turn is added. A message count
    // alone never changes mid-stream, so the answer scrolls out of view.
    const contentLength = turns.reduce(
        (total, turn) =>
            total +
            (turn.edits[turn.activeEditIndex]?.length ?? 0) +
            (turn.responses[turn.activeEditIndex]?.length ?? 0),
        0,
    )
    const { viewportRef, isPinned, scrollToBottom } = useScrollAnchor(contentLength)

    useEffect(() => {
        loadChats()
    }, [loadChats])

    useEffect(() => {
        loadProjects()
    }, [loadProjects])

    const activeChat = chats.find((chat) => chat.id === chatId)
    const isChatFull = (activeChat?.tokenCount ?? 0) >= MAX_CHAT_TOKENS
    const errorNotice = error ? <p className="px-4 py-2 text-sm text-red-400">{error}</p> : null

    // The server cascade already deleted this project's chats, so the sidebar
    // list has to be refetched or its stale rows 404 on the next click.
    const handleDeleteProject = async (projectId: string) => {
        await removeProject(projectId)
        loadChats()
    }

    return (
        <div className="flex h-svh bg-black w-full">
            <ChatSidebar
                chats={chats}
                activeChatId={chatId}
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                onSelect={selectChat}
                onNewChat={startNewChat}
                onDelete={deleteChat}
                user={user}
                onSignOut={signOut}
                onUpgrade={startUpgrade}
                projects={projects}
                projectError={projectError}
                pendingProjectId={pendingProjectId}
                onCreateProject={addProject}
                onRenameProject={renameProject}
                onNewChatInProject={startNewChatInProject}
                onDeleteProject={handleDeleteProject}
            />

            <div className="relative flex-1">
                <button
                    type="button"
                    onClick={() => setIsSidebarOpen(true)}
                    aria-label="Open chat history"
                    className="absolute top-3 left-3 z-30 flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 md:hidden"
                >
                    <Menu size={18} />
                </button>

                {turns.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 px-4">
                        <div className="flex flex-col items-center gap-3 text-center">
                            <p className="text-md text-zinc-400">Start a new conversation</p>
                        </div>
                        <div className="w-full max-w-3xl">
                            {errorNotice}
                            {isChatFull ? (
                                <div className="flex justify-center px-4 py-3">
                                    <button
                                        type="button"
                                        onClick={startNewChat}
                                        className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
                                    >
                                        Start a new chat
                                    </button>
                                </div>
                            ) : (
                                <Composer onSend={sendMessage} isStreaming={isStreaming} onStop={stopStreaming} autoFocus />
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex h-full flex-col">
                        <div
                            ref={viewportRef}
                            role="region"
                            aria-label="Conversation"
                            className="no-scrollbar flex-1 overflow-y-auto px-3 pt-8 pb-40 sm:px-4 sm:pt-12"
                        >
                            <div className="mx-auto w-full max-w-3xl">
                                {turns.map((turn) => {
                                    const content = turn.edits[turn.activeEditIndex]
                                    const response = turn.responses[turn.activeEditIndex]
                                    const isTurnStreaming = turn.id === streamingTurnId

                                    return (
                                        <div key={turn.id}>
                                            <Message
                                                role="user"
                                                content={content}
                                                editIndex={turn.activeEditIndex + 1}
                                                editCount={turn.edits.length}
                                                onNavigateEdit={(direction) => navigateEdit(turn.id, direction)}
                                                onEdit={(newContent) => editMessage(turn.id, newContent)}
                                            />
                                            {(response || isTurnStreaming) && (
                                                <Message role="assistant" content={response} isStreaming={isTurnStreaming} />
                                            )}
                                        </div>
                                    )
                                })}
                                {errorNotice}
                            </div>
                        </div>

                        <div className="absolute inset-x-0 bottom-0">
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-black via-black/2 to-transparent" />
                            {!isPinned && (
                                <div className="relative flex justify-center pb-3">
                                    <button
                                        type="button"
                                        onClick={scrollToBottom}
                                        aria-label="Jump to latest"
                                        className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                                    >
                                        <ArrowDown size={18} />
                                    </button>
                                </div>
                            )}

                            <div className="relative bottom-5">
                                {isChatFull ? (
                                    <div className="flex justify-center px-4 py-3">
                                        <button
                                            type="button"
                                            onClick={startNewChat}
                                            className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
                                        >
                                            Start a new chat
                                        </button>
                                    </div>
                                ) : (
                                    <Composer onSend={sendMessage} isStreaming={isStreaming} onStop={stopStreaming} />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
