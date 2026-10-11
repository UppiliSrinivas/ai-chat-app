import type { ChatSummary } from '../api/chats'
import type { ProjectSummary } from '../api/projects'

export type SidebarLists = { chats: ChatSummary[]; projects: ProjectSummary[] }

export type SidebarEdit =
  | { kind: 'deleteChat'; chatId: string }
  | { kind: 'deleteProject'; projectId: string }
  | { kind: 'renameProject'; projectId: string; name: string }

/** What the sidebar shows once an edit lands, so it can show it before the server confirms. */
export const applySidebarEdit = (lists: SidebarLists, edit: SidebarEdit): SidebarLists => {
  if (edit.kind === 'deleteChat') {
    return { ...lists, chats: lists.chats.filter((chat) => chat.id !== edit.chatId) }
  }

  if (edit.kind === 'deleteProject') {
    // The server deletes a project's chats with it, so they leave the list together.
    return {
      chats: lists.chats.filter((chat) => chat.projectId !== edit.projectId),
      projects: lists.projects.filter((project) => project.id !== edit.projectId),
    }
  }

  return {
    ...lists,
    projects: lists.projects.map((project) =>
      project.id === edit.projectId ? { ...project, name: edit.name } : project,
    ),
  }
}
