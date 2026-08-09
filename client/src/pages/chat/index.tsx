import { useEffect, useRef } from 'react'
import Composer from '../../components/composser'
import Message from '../../components/message'
import { useChatStore } from '../../hooks/useChatStore'

export default function ChatPage() {
    const turns = useChatStore((state) => state.turns)
    const isStreaming = useChatStore((state) => state.isStreaming)
    const streamingTurnId = useChatStore((state) => state.streamingTurnId)
    const error = useChatStore((state) => state.error)
    const sendMessage = useChatStore((state) => state.sendMessage)
    const editMessage = useChatStore((state) => state.editMessage)
    const navigateEdit = useChatStore((state) => state.navigateEdit)
    const stopStreaming = useChatStore((state) => state.stopStreaming)

    const bottomRef = useRef<HTMLDivElement>(null)
    const previousTurnCountRef = useRef(0)

    useEffect(() => {
        if (turns.length > previousTurnCountRef.current) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
        previousTurnCountRef.current = turns.length
    }, [turns.length])

    if (turns.length === 0) {
        return (
            <div className="flex h-svh flex-col items-center justify-center gap-2 bg-black px-4">
                <div className="flex flex-col items-center gap-3 text-center">
                    <p className="text-md text-zinc-400">Start a new conversation</p>
                </div>
                <div className="w-full max-w-3xl">
                    <Composer onSend={sendMessage} isStreaming={isStreaming} onStop={stopStreaming} autoFocus />
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-svh flex-col bg-black">
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

            <div className="fixed inset-x-0 bottom-0">
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-black via-black/2 to-transparent" />
                <div className="relative bottom-5">
                    <Composer onSend={sendMessage} isStreaming={isStreaming} onStop={stopStreaming} />
                </div>
            </div>
        </div>
    )
}
