import { useState } from 'react'
import { Folder, LogIn, LogOut, Plus, Trash2, X } from 'lucide-react'
import type { User } from '../../api/auth'
import type { ChatSummary } from '../../api/chats'
import type { ProjectSummary } from '../../api/projects'
import ConfirmDialog from '../confirm-dialog/ConfirmDialog'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { MAX_CHATS_PER_PROJECT } from '../../lib/limits'

export type ChatSidebarProps = {
  chats: ChatSummary[]
  activeChatId: string | null
  isOpen: boolean
  user: User | null
  projects: ProjectSummary[]
  projectError: string | null
  onClose: () => void
  onSelect: (chatId: string) => void
  onNewChat: () => void
  onDelete: (chatId: string) => void
  onSignOut: () => void
  onUpgrade: () => void
  onNewProject: () => void
  onNewChatInProject: (projectId: string) => void
  onDeleteProject: (projectId: string) => void
}

export default function ChatSidebar({
  chats,
  activeChatId,
  isOpen,
  user,
  projects,
  projectError,
  onClose,
  onSelect,
  onNewChat,
  onDelete,
  onSignOut,
  onUpgrade,
  onNewProject,
  onNewChatInProject,
  onDeleteProject,
}: ChatSidebarProps) {
  // What the confirm dialog is currently asking about, or null when closed.
  const [pendingDelete, setPendingDelete] = useState<
    { kind: 'chat'; id: string; title: string } | { kind: 'project'; id: string; name: string; chatCount: number } | null
  >(null)

  const confirmDelete = () => {
    if (!pendingDelete) return
    if (pendingDelete.kind === 'chat') onDelete(pendingDelete.id)
    else onDeleteProject(pendingDelete.id)
    setPendingDelete(null)
  }

  // Off-screen but still in the DOM on mobile, so its buttons stay tab-
  // reachable without this. Desktop always shows it, hence the width check —
  // `inert` is an attribute, so no `md:` class can undo it.
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isHidden = !isDesktop && !isOpen

  const handleSelect = (chatId: string) => {
    onSelect(chatId)
    onClose()
  }

  const handleNewChat = () => {
    onNewChat()
    onClose()
  }

  // Chats inside a project are listed under it, so showing them here too would
  // make the same chat look like it belongs nowhere.
  const looseChats = chats.filter((chat) => chat.projectId === null)

  return (
    <>
      {isOpen && (
        <div onClick={onClose} className="fixed inset-0 z-40 bg-black/60 md:hidden" aria-hidden="true" />
      )}

      <aside
        inert={isHidden}
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

        <div className="px-2 pb-2">
          <div className="flex items-center justify-between px-3 py-1">
            <span className="text-xs font-medium text-zinc-500">Projects</span>
            <button
              type="button"
              onClick={onNewProject}
              aria-label="New project"
              className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <Plus size={14} />
            </button>
          </div>

          {projectError && (
            <p role="alert" className="px-3 py-1 text-xs text-red-400">
              {projectError}
            </p>
          )}

          {projects.map((project) => (
            <div key={project.id} className="group/project relative">
              <div className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300">
                <Folder size={14} className="shrink-0" />
                <span className="flex-1 truncate">{project.name}</span>
                <span className="text-xs text-zinc-500">
                  {project.chatCount}/{MAX_CHATS_PER_PROJECT}
                </span>
              </div>

              {/* A full project can't take another chat, so it offers the only
                  action that still moves the user forward. */}
              {project.chatCount >= MAX_CHATS_PER_PROJECT ? (
                <button
                  type="button"
                  onClick={onNewProject}
                  className="ml-8 px-3 pb-1 text-left text-xs text-zinc-500 hover:text-zinc-300"
                >
                  + New project
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onNewChatInProject(project.id)}
                  className="ml-8 px-3 pb-1 text-left text-xs text-zinc-500 hover:text-zinc-300"
                >
                  + New chat
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  setPendingDelete({
                    kind: 'project',
                    id: project.id,
                    name: project.name,
                    chatCount: project.chatCount,
                  })
                }
                aria-label={`Delete project "${project.name}"`}
                className="absolute top-2 right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 opacity-0 hover:bg-zinc-700 hover:text-zinc-100 group-hover/project:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <nav className="no-scrollbar flex-1 overflow-y-auto px-2 pb-3">
          {looseChats.length === 0 && (
            <p className="px-3 py-2 text-sm text-zinc-500">No chats yet</p>
          )}
          {looseChats.map((chat) => (
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
                  setPendingDelete({ kind: 'chat', id: chat.id, title: chat.title })
                }}
                aria-label={`Delete "${chat.title}"`}
                className="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-zinc-500 opacity-0 hover:bg-zinc-700 hover:text-zinc-100 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </nav>

        <div className="border-t border-zinc-800 p-3">
          <p className="truncate px-1 pb-2 text-xs text-zinc-500">{user?.email ?? 'Guest'}</p>
          {/* A guest's only identity is the session cookie, so signing out would
              strand their chats with no way back in. Offer the upgrade instead. */}
          {user?.isAnonymous ? (
            <button
              type="button"
              onClick={onUpgrade}
              className="flex w-full items-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
            >
              <LogIn size={16} />
              Sign in to save chats
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignOut}
              className="flex w-full items-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
            >
              <LogOut size={16} />
              Sign out
            </button>
          )}
        </div>

        <ConfirmDialog
          isOpen={pendingDelete !== null}
          title={
            pendingDelete?.kind === 'project'
              ? `Delete "${pendingDelete.name}"?`
              : `Delete "${pendingDelete?.title ?? ''}"?`
          }
          body={
            pendingDelete?.kind === 'project'
              ? `This permanently deletes the project and its ${pendingDelete.chatCount} chat${pendingDelete.chatCount === 1 ? '' : 's'}. This can't be undone.`
              : "This permanently deletes the chat and its messages. This can't be undone."
          }
          confirmLabel={pendingDelete?.kind === 'project' ? 'Delete project and chats' : 'Delete'}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      </aside>
    </>
  )
}
