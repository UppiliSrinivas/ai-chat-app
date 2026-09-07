import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectList, { type ProjectListProps } from './ProjectList'
import { MAX_CHATS_PER_PROJECT } from '../../lib/limits'

const research = { id: 'p1', name: 'Research', chatCount: 2, updatedAt: '' }
const marketing = { id: 'p2', name: 'Marketing', chatCount: 1, updatedAt: '' }

const chats = [
  { id: 'c1', title: 'Vector DBs', projectId: 'p1', messageCount: 0, tokenCount: 0, updatedAt: '' },
  { id: 'c2', title: 'Embedding costs', projectId: 'p1', messageCount: 0, tokenCount: 0, updatedAt: '' },
  { id: 'c3', title: 'Launch copy', projectId: 'p2', messageCount: 0, tokenCount: 0, updatedAt: '' },
  { id: 'c4', title: 'Loose chat', projectId: null, messageCount: 0, tokenCount: 0, updatedAt: '' },
]

const setup = (props: Partial<ProjectListProps> = {}) => {
  const handlers = {
    onNewProject: vi.fn(),
    onRenameProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onSelectChat: vi.fn(),
    onDeleteChat: vi.fn(),
    onNewChatInProject: vi.fn(),
  }
  render(
    <ProjectList
      projects={[research, marketing]}
      chats={chats}
      activeChatId={null}
      pendingProjectId={null}
      error={null}
      {...handlers}
      {...props}
    />,
  )
  return { ...handlers, user: userEvent.setup() }
}

const projectToggle = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })

describe('ProjectList', () => {
  it('lists projects with their chat counts', () => {
    setup()

    expect(projectToggle('Research')).toBeInTheDocument()
    expect(screen.getByText(`2/${MAX_CHATS_PER_PROJECT}`)).toBeInTheDocument()
  })

  it('starts collapsed', () => {
    setup()

    expect(projectToggle('Research')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Vector DBs' })).toBeNull()
  })

  it('lists a project’s chats when it is clicked', async () => {
    const { user } = setup()

    await user.click(projectToggle('Research'))

    expect(projectToggle('Research')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Vector DBs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Embedding costs' })).toBeInTheDocument()
  })

  it('shows only that project’s chats', async () => {
    const { user } = setup()

    await user.click(projectToggle('Research'))

    expect(screen.queryByRole('button', { name: 'Launch copy' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Loose chat' })).toBeNull()
  })

  it('collapses again when clicked twice', async () => {
    const { user } = setup()

    await user.click(projectToggle('Research'))
    await user.click(projectToggle('Research'))

    expect(screen.queryByRole('button', { name: 'Vector DBs' })).toBeNull()
  })

  it('opens a second project without closing the first', async () => {
    const { user } = setup()

    await user.click(projectToggle('Research'))
    await user.click(projectToggle('Marketing'))

    expect(screen.getByRole('button', { name: 'Vector DBs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Launch copy' })).toBeInTheDocument()
  })

  it('says an open project is empty when it has no chats', async () => {
    const { user } = setup({ projects: [{ ...research, chatCount: 0 }], chats: [] })

    await user.click(projectToggle('Research'))

    expect(screen.getByText('No chats in this project')).toBeInTheDocument()
  })

  // Reloading onto a chat inside a project should show you where you are,
  // not hide it behind a collapsed row.
  it('opens the project holding the active chat', () => {
    setup({ activeChatId: 'c2' })

    expect(projectToggle('Research')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Embedding costs' })).toHaveAttribute('aria-current', 'page')
  })

  it('lets you collapse the project holding the active chat', async () => {
    const { user } = setup({ activeChatId: 'c2' })

    await user.click(projectToggle('Research'))

    expect(screen.queryByRole('button', { name: 'Embedding costs' })).toBeNull()
  })

  // The chat isn't created until the first message, so without a placeholder
  // "+ New chat" looks like it did nothing at all.
  it('shows a placeholder for a chat that has not been sent yet', () => {
    setup({ pendingProjectId: 'p1' })

    expect(projectToggle('Research')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('New chat…')).toBeInTheDocument()
  })

  it('selects a chat inside a project', async () => {
    const { onSelectChat, user } = setup()

    await user.click(projectToggle('Research'))
    await user.click(screen.getByRole('button', { name: 'Vector DBs' }))

    expect(onSelectChat).toHaveBeenCalledExactlyOnceWith('c1')
  })

  it('deletes a chat inside a project', async () => {
    const { onDeleteChat, user } = setup()

    await user.click(projectToggle('Research'))
    await user.click(screen.getByRole('button', { name: 'Delete "Vector DBs"' }))

    expect(onDeleteChat).toHaveBeenCalledExactlyOnceWith(chats[0])
  })

  it('starts a new chat inside a project', async () => {
    const { onNewChatInProject, user } = setup()

    await user.click(projectToggle('Research'))
    await user.click(screen.getByRole('button', { name: '+ New chat' }))

    expect(onNewChatInProject).toHaveBeenCalledExactlyOnceWith('p1')
  })

  // A full project can't take another chat, so the only forward action left
  // is starting a new project.
  it('offers a new project instead of a new chat when full', async () => {
    const { onNewProject, onNewChatInProject, user } = setup({
      projects: [{ ...research, chatCount: MAX_CHATS_PER_PROJECT }],
    })

    await user.click(projectToggle('Research'))
    await user.click(screen.getByRole('button', { name: '+ New project' }))

    expect(onNewProject).toHaveBeenCalledOnce()
    expect(onNewChatInProject).not.toHaveBeenCalled()
  })

  it('creates a project from the header button', async () => {
    const { onNewProject, user } = setup()

    await user.click(screen.getByRole('button', { name: 'New project' }))

    expect(onNewProject).toHaveBeenCalledOnce()
  })

  it('renames a project', async () => {
    const { onRenameProject, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Rename project "Research"' }))

    expect(onRenameProject).toHaveBeenCalledExactlyOnceWith(research)
  })

  it('deletes a project', async () => {
    const { onDeleteProject, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Delete project "Research"' }))

    expect(onDeleteProject).toHaveBeenCalledExactlyOnceWith(research)
  })

  // Renaming and deleting must not also toggle the row they sit inside.
  it('keeps the row collapsed when a row action is used', async () => {
    const { user } = setup()

    await user.click(screen.getByRole('button', { name: 'Rename project "Research"' }))

    expect(projectToggle('Research')).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows a project failure', () => {
    setup({ error: 'Too many requests. Please try again shortly.' })

    expect(screen.getByRole('alert')).toHaveTextContent('Too many requests. Please try again shortly.')
  })

  it('stays quiet when projects are fine', () => {
    setup()

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('invites a first project when there are none', async () => {
    const { onNewProject, user } = setup({ projects: [], chats: [] })

    await user.click(screen.getByRole('button', { name: /Group related chats/ }))

    expect(onNewProject).toHaveBeenCalledOnce()
  })
})
