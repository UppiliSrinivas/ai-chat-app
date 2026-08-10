import { Plus, Trash2, X } from 'lucide-react'
import type { ChatSummary } from '../../api/chats'

export type ChatSidebarProps = {
  chats: ChatSummary[]
  activeChatId: string | null
  isOpen: boolean
  onClose: () => void
  onSelect: (chatId: string) => void
  onNewChat: () => void
  onDelete: (chatId: string) => void
}

export default function ChatSidebar({
  chats,
  activeChatId,
  isOpen,
  onClose,
  onSelect,
  onNewChat,
  onDelete,
}: ChatSidebarProps) {
  const handleSelect = (chatId: string) => {
    onSelect(chatId)
    onClose()
  }

  const handleNewChat = () => {
    onNewChat()
    onClose()
  }

  return (
    <>
      {isOpen && (
        <div onClick={onClose} className="fixed inset-0 z-40 bg-black/60 md:hidden" aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center gap-2 p-3">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex flex-1 items-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
          >
            <Plus size={16} />
            New chat
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="no-scrollbar flex-1 overflow-y-auto px-2 pb-3">
          {chats.length === 0 && (
            <p className="px-3 py-2 text-sm text-zinc-500">No chats yet</p>
          )}
          {chats.map((chat) => (
            <div key={chat.id} className="group relative">
              <button
                type="button"
                onClick={() => handleSelect(chat.id)}
                className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 ${chat.id === activeChatId ? 'bg-zinc-800 text-zinc-100' : ''}`}
              >
                {chat.title}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete(chat.id)
                }}
                aria-label="Delete chat"
                className="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-zinc-500 opacity-0 hover:bg-zinc-700 hover:text-zinc-100 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}
