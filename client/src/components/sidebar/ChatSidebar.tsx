import { useState } from 'react'
import { LogIn, LogOut, Plus, X } from 'lucide-react'
import type { User } from '../../api/auth'
import type { ChatSummary } from '../../api/chats'
import type { ProjectSummary } from '../../api/projects'
import ConfirmDialog from '../confirm-dialog/ConfirmDialog'
import PromptDialog from '../prompt-dialog/PromptDialog'
import ChatRow from './ChatRow'
import ProjectList from './ProjectList'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { APP_COMMIT, APP_VERSION, formatVersion } from '../../lib/version'

export type ChatSidebarProps = {
  chats: ChatSummary[]
  activeChatId: string | null
  isOpen: boolean
  user: User | null
  projects: ProjectSummary[]
  projectError: string | null
  pendingProjectId: string | null
  onClose: () => void
  onSelect: (chatId: string) => void
  onNewChat: () => void
  onDelete: (chatId: string) => void
  onSignOut: () => void
  onUpgrade: () => void
  onCreateProject: (name: string) => void
  onRenameProject: (projectId: string, name: string) => void
  onNewChatInProject: (projectId: string) => void
  onDeleteProject: (projectId: string) => void
}

type PendingDelete =
  | { kind: 'chat'; id: string; title: string }
  | { kind: 'project'; id: string; name: string; chatCount: number }

type ProjectPrompt = { mode: 'create' } | { mode: 'rename'; id: string; name: string }

// What the confirm dialog should say, worked out in one place rather than as
// three ternaries spread across the JSX.
function describeDelete(pending: PendingDelete | null) {
  if (!pending) return null

  if (pending.kind === 'chat') {
    return {
      title: `Delete "${pending.title}"?`,
      body: "This permanently deletes the chat and its messages. This can't be undone.",
      confirmLabel: 'Delete',
    }
  }

  const chats = pending.chatCount === 1 ? '1 chat' : `${pending.chatCount} chats`
  return {
    title: `Delete "${pending.name}"?`,
    body: `This permanently deletes the project and its ${chats}. This can't be undone.`,
    confirmLabel: 'Delete project and chats',
  }
}

// Same for the name dialog: create and rename differ in wording, not behaviour.
function describePrompt(prompt: ProjectPrompt | null) {
  if (!prompt) return null

  if (prompt.mode === 'rename') {
    return { title: 'Rename project', initialValue: prompt.name, submitLabel: 'Save', description: undefined }
  }

  return {
    title: 'New project',
    initialValue: '',
    submitLabel: 'Create project',
    description: 'Chats you start inside it are kept together.',
  }
}

export default function ChatSidebar({
  chats,
  activeChatId,
  isOpen,
  user,
  projects,
  projectError,
  pendingProjectId,
  onClose,
  onSelect,
  onNewChat,
  onDelete,
  onSignOut,
  onUpgrade,
  onCreateProject,
  onRenameProject,
  onNewChatInProject,
  onDeleteProject,
}: ChatSidebarProps) {
  // What the confirm dialog is currently asking about, or null when closed.
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  // Which project the name dialog is for — a new one, or one being renamed.
  const [projectPrompt, setProjectPrompt] = useState<ProjectPrompt | null>(null)

  const confirmDelete = () => {
    if (!pendingDelete) return
    if (pendingDelete.kind === 'chat') onDelete(pendingDelete.id)
    else onDeleteProject(pendingDelete.id)
    setPendingDelete(null)
  }

  const submitProjectName = (name: string) => {
    if (!projectPrompt) return
    if (projectPrompt.mode === 'create') onCreateProject(name)
    else onRenameProject(projectPrompt.id, name)
    setProjectPrompt(null)
  }

  // Off-screen but still in the DOM on mobile, so its buttons stay tab-
  // reachable without this. Desktop always shows it, hence the width check —
  // `inert` is an attribute, so no `md:` class can undo it.
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isHidden = !isDesktop && !isOpen

  // Three states, not two: a visitor who has never sent a message has no
  // account at all, so "Sign out" would be offering to end nothing.
  const canSignOut = user !== null && !user.isAnonymous

  const handleSelect = (chatId: string) => {
    onSelect(chatId)
    onClose()
  }

  const handleNewChat = () => {
    onNewChat()
    onClose()
  }

  const handleNewChatInProject = (projectId: string) => {
    onNewChatInProject(projectId)
    onClose()
  }

  // Chats inside a project are listed under it, so showing them here too would
  // make the same chat look like it belongs nowhere.
  const looseChats = chats.filter((chat) => chat.projectId === null)
  const deletePrompt = describeDelete(pendingDelete)
  const namePrompt = describePrompt(projectPrompt)

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          className="fade-in fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        inert={isHidden}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 transition-transform duration-300 ease-out md:static md:z-auto md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center gap-2 p-3">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex flex-1 items-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
          >
            <Plus size={16} />
            New chat
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto pb-3">
          <ProjectList
            projects={projects}
            chats={chats}
            activeChatId={activeChatId}
            pendingProjectId={pendingProjectId}
            error={projectError}
            onNewProject={() => setProjectPrompt({ mode: 'create' })}
            onRenameProject={(project) =>
              setProjectPrompt({ mode: 'rename', id: project.id, name: project.name })
            }
            onDeleteProject={(project) =>
              setPendingDelete({
                kind: 'project',
                id: project.id,
                name: project.name,
                chatCount: project.chatCount,
              })
            }
            onSelectChat={handleSelect}
            onDeleteChat={(chat) => setPendingDelete({ kind: 'chat', id: chat.id, title: chat.title })}
            onNewChatInProject={handleNewChatInProject}
          />

          <nav className="px-2 pt-2">
            <p className="px-3 py-1 text-xs font-medium tracking-wide text-zinc-500 uppercase">Chats</p>

            {looseChats.length === 0 && <p className="px-3 py-2 text-sm text-zinc-600">No chats yet</p>}

            {looseChats.map((chat) => (
              <div key={chat.id} className="fade-in">
                <ChatRow
                  title={chat.title}
                  isActive={chat.id === activeChatId}
                  onSelect={() => handleSelect(chat.id)}
                  onDelete={() => setPendingDelete({ kind: 'chat', id: chat.id, title: chat.title })}
                />
              </div>
            ))}
          </nav>
        </div>

        <div className="border-t border-zinc-800 p-3">
          <p className="truncate px-1 pb-2 text-xs text-zinc-500">{user?.email ?? 'Guest'}</p>
          {/* A guest's only identity is the session cookie, so signing out would
              strand their chats with no way back in. Offer the upgrade instead. */}
          {canSignOut ? (
            <button
              type="button"
              onClick={onSignOut}
              className="flex w-full items-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
            >
              <LogOut size={16} />
              Sign out
            </button>
          ) : (
            <button
              type="button"
              onClick={onUpgrade}
              className="flex w-full items-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
            >
              <LogIn size={16} />
              Sign in to save chats
            </button>
          )}
          {/* Baked in at build time, so this names the bundle actually running
              rather than the branch someone happens to have checked out. */}
          <p className="px-1 pt-2 text-center text-[11px] text-zinc-600">
            {formatVersion(APP_VERSION, APP_COMMIT)}
          </p>
        </div>

        <PromptDialog
          isOpen={namePrompt !== null}
          title={namePrompt?.title ?? ''}
          label="Project name"
          placeholder="Research notes"
          description={namePrompt?.description}
          initialValue={namePrompt?.initialValue ?? ''}
          submitLabel={namePrompt?.submitLabel}
          onSubmit={submitProjectName}
          onCancel={() => setProjectPrompt(null)}
        />

        <ConfirmDialog
          isOpen={deletePrompt !== null}
          title={deletePrompt?.title ?? ''}
          body={deletePrompt?.body ?? ''}
          confirmLabel={deletePrompt?.confirmLabel}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      </aside>
    </>
  )
}
