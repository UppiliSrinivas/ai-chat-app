import { describe, expect, it } from 'vitest'
import { applySidebarEdit, type SidebarLists } from './sidebarEdits'

const chat = (id: string, projectId: string | null = null) => ({
  id,
  title: `Chat ${id}`,
  projectId,
  messageCount: 0,
  tokenCount: 0,
  updatedAt: '',
})
const project = (id: string, name = `Project ${id}`) => ({ id, name, chatCount: 0, updatedAt: '' })

const lists: SidebarLists = {
  chats: [chat('c1'), chat('c2', 'p1'), chat('c3', 'p2')],
  projects: [project('p1'), project('p2')],
}

describe('applySidebarEdit', () => {
  it('removes a deleted chat and nothing else', () => {
    const next = applySidebarEdit(lists, { kind: 'deleteChat', chatId: 'c2' })

    expect(next.chats.map((entry) => entry.id)).toEqual(['c1', 'c3'])
    expect(next.projects).toBe(lists.projects)
  })

  // The server deletes a project's chats with it, so the sidebar must too.
  it("removes a deleted project along with its chats, keeping other projects' chats", () => {
    const next = applySidebarEdit(lists, { kind: 'deleteProject', projectId: 'p1' })

    expect(next.projects.map((entry) => entry.id)).toEqual(['p2'])
    expect(next.chats.map((entry) => entry.id)).toEqual(['c1', 'c3'])
  })

  it('renames only the targeted project', () => {
    const next = applySidebarEdit(lists, { kind: 'renameProject', projectId: 'p2', name: 'Research' })

    expect(next.projects.map((entry) => entry.name)).toEqual(['Project p1', 'Research'])
    expect(next.chats).toBe(lists.chats)
  })

  // Re-applied on top of a list that already reflects the server: must be harmless.
  it('changes nothing when the target is already gone', () => {
    const next = applySidebarEdit(lists, { kind: 'deleteChat', chatId: 'missing' })

    expect(next.chats).toEqual(lists.chats)
  })
})
