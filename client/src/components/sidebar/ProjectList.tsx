import { useState } from 'react'
import { ChevronRight, FolderPlus, Pencil, Trash2 } from 'lucide-react'
import type { ChatSummary } from '../../api/chats'
import type { ProjectSummary } from '../../api/projects'
import ChatRow from './ChatRow'
import PendingChatRow from './PendingChatRow'
import { MAX_CHATS_PER_PROJECT } from '../../lib/limits'

export type ProjectListProps = {
  projects: ProjectSummary[]
  chats: ChatSummary[]
  activeChatId: string | null
  // The project a started-but-unsent chat belongs to, or null.
  pendingProjectId: string | null
  error: string | null
  onNewProject: () => void
  onRenameProject: (project: ProjectSummary) => void
  onDeleteProject: (project: ProjectSummary) => void
  onSelectChat: (chatId: string) => void
  onDeleteChat: (chat: ChatSummary) => void
  onNewChatInProject: (projectId: string) => void
}

export default function ProjectList({
  projects,
  chats,
  activeChatId,
  pendingProjectId,
  error,
  onNewProject,
  onRenameProject,
  onDeleteProject,
  onSelectChat,
  onDeleteChat,
  onNewChatInProject,
}: ProjectListProps) {
  // Only projects the user has explicitly toggled land here; everything else
  // falls back to "open if it holds the chat you're looking at".
  const [manuallyToggled, setManuallyToggled] = useState<Record<string, boolean>>({})

  const activeProjectId = chats.find((chat) => chat.id === activeChatId)?.projectId ?? null
  const isExpanded = (projectId: string) =>
    manuallyToggled[projectId] ?? (projectId === activeProjectId || projectId === pendingProjectId)

  const toggle = (projectId: string) =>
    setManuallyToggled((previous) => ({ ...previous, [projectId]: !isExpanded(projectId) }))

  return (
    <div className="px-2 pb-1">
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Projects</span>
        <button
          type="button"
          onClick={onNewProject}
          aria-label="New project"
          className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:bg-zinc-800 focus-visible:text-zinc-100 focus-visible:outline-none"
        >
          <FolderPlus size={14} />
        </button>
      </div>

      {error && (
        <p role="alert" className="fade-in px-3 py-1 text-xs text-red-400">
          {error}
        </p>
      )}

      {projects.length === 0 && !error && (
        <button
          type="button"
          onClick={onNewProject}
          className="w-full rounded-lg px-3 py-2 text-left text-xs leading-5 text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-300"
        >
          Group related chats into a project.
        </button>
      )}

      {projects.map((project) => {
        const expanded = isExpanded(project.id)
        const projectChats = chats.filter((chat) => chat.projectId === project.id)
        const isFull = project.chatCount >= MAX_CHATS_PER_PROJECT
        // A full project can't take another chat, so it offers the only action
        // that still moves the user forward.
        const footerAction = isFull
          ? { label: '+ New project', run: onNewProject }
          : { label: '+ New chat', run: () => onNewChatInProject(project.id) }

        return (
          <div key={project.id} className="group/project fade-in">
            <div className="flex items-center rounded-lg transition-colors hover:bg-zinc-800/60">
              <button
                type="button"
                onClick={() => toggle(project.id)}
                aria-expanded={expanded}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pl-2 text-left text-sm text-zinc-300 focus-visible:outline-none"
              >
                <ChevronRight
                  size={14}
                  className={`shrink-0 text-zinc-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                />
                <span className="flex-1 truncate">{project.name}</span>
                <span className={`shrink-0 text-[11px] ${isFull ? 'text-amber-500/80' : 'text-zinc-600'}`}>
                  {project.chatCount}/{MAX_CHATS_PER_PROJECT}
                </span>
              </button>

              <div className="flex shrink-0 items-center pr-1 pl-1">
                <button
                  type="button"
                  onClick={() => onRenameProject(project)}
                  aria-label={`Rename project "${project.name}"`}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 opacity-0 transition-all duration-150 hover:bg-zinc-700 hover:text-zinc-100 focus-visible:opacity-100 focus-visible:outline-none group-hover/project:opacity-100"
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteProject(project)}
                  aria-label={`Delete project "${project.name}"`}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 opacity-0 transition-all duration-150 hover:bg-zinc-700 hover:text-zinc-100 focus-visible:opacity-100 focus-visible:outline-none group-hover/project:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {expanded && (
              <div className="accordion-panel">
                <div className="ml-3 overflow-hidden border-l border-zinc-800 pl-1">
                  {projectChats.length === 0 && pendingProjectId !== project.id && (
                    <p className="px-3 py-2 text-xs text-zinc-600">No chats in this project</p>
                  )}

                  {projectChats.map((chat) => (
                    <ChatRow
                      key={chat.id}
                      title={chat.title}
                      isActive={chat.id === activeChatId}
                      onSelect={() => onSelectChat(chat.id)}
                      onDelete={() => onDeleteChat(chat)}
                    />
                  ))}

                  {pendingProjectId === project.id && (
                    <PendingChatRow />
                  )}

                  <button
                    type="button"
                    onClick={footerAction.run}
                    className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-zinc-500 transition-colors hover:bg-zinc-800/70 hover:text-zinc-200 focus-visible:outline-none"
                  >
                    {footerAction.label}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
