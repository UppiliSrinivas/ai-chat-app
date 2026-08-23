import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))

vi.mock('./client', () => ({ apiFetch }))

const { createProject, deleteProject, listProjects, renameProject } = await import('./projects')

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue(undefined)
})

describe('projects api', () => {
  it('lists projects with a plain GET', async () => {
    await listProjects()

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/projects')
  })

  it('creates a project with the given name', async () => {
    await createProject('Research')

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Research' }),
    })
  })

  // Omitting the name lets the server apply its own default rather than the
  // client inventing a second source of truth for it.
  it('creates a project with no name when none is given', async () => {
    await createProject()

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/projects', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  })

  it('renames a project', async () => {
    await renameProject('p1', 'Renamed')

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/projects/p1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed' }),
    })
  })

  it('deletes a project', async () => {
    await deleteProject('p1')

    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/projects/p1', { method: 'DELETE' })
  })

  it('returns whatever the server sent back', async () => {
    const projects = [{ id: 'p1', name: 'Research', chatCount: 3, updatedAt: '2026-01-01' }]
    apiFetch.mockResolvedValue(projects)

    await expect(listProjects()).resolves.toEqual(projects)
  })

  it('lets a failure propagate', async () => {
    apiFetch.mockRejectedValue(new Error('Project not found.'))

    await expect(deleteProject('missing')).rejects.toThrow('Project not found.')
  })
})
