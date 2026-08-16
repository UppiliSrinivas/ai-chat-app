import { useEffect, useRef, useState } from 'react'
import { Menu } from 'lucide-react'
import Composer from '../../components/composser'
import Message from '../../components/message'
import ChatSidebar from '../../components/sidebar/ChatSidebar'
import { useAuthStore } from '../../hooks/useAuthStore'
import { useChatStore } from '../../hooks/useChatStore'

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
    const deleteChat = useChatStore((state) => state.deleteChat)
    const user = useAuthStore((state) => state.user)
    const signOut = useAuthStore((state) => state.signOut)
    const startUpgrade = useAuthStore((state) => state.startUpgrade)

    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const bottomRef = useRef<HTMLDivElement>(null)
    const previousTurnCountRef = useRef(0)

    useEffect(() => {
        loadChats()
    }, [loadChats])

    useEffect(() => {
        if (turns.length > previousTurnCountRef.current) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
        previousTurnCountRef.current = turns.length
    }, [turns.length])

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
                            <Composer onSend={sendMessage} isStreaming={isStreaming} onStop={stopStreaming} autoFocus />
                        </div>
                    </div>
                ) : (
                    <div className="flex h-full flex-col">
                        <div className="no-scrollbar flex-1 overflow-y-auto px-3 pt-8 pb-40 sm:px-4 sm:pt-12">
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
                                {error && <p className="px-4 py-2 text-sm text-red-400">{error}</p>}
                            </div>
                            <div ref={bottomRef} />
                        </div>

                        <div className="absolute inset-x-0 bottom-0">
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-black via-black/2 to-transparent" />
                            <div className="relative bottom-5">
                                <Composer onSend={sendMessage} isStreaming={isStreaming} onStop={stopStreaming} />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
