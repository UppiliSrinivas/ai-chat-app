import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  createProject: vi.fn(),
  listProjects: vi.fn(),
  renameProject: vi.fn(),
  deleteProject: vi.fn(),
}))

vi.mock('../api/projects', () => api)

const { useProjectStore } = await import('./useProjectStore')

const research = { id: 'p1', name: 'Research', chatCount: 3, updatedAt: '2026-01-01' }
const initial = useProjectStore.getState()

beforeEach(() => {
  useProjectStore.setState(initial, true)
  api.createProject.mockReset().mockResolvedValue(research)
  api.listProjects.mockReset().mockResolvedValue([research])
  api.renameProject.mockReset().mockResolvedValue({ ...research, name: 'Renamed' })
  api.deleteProject.mockReset().mockResolvedValue(undefined)
})

describe('loadProjects', () => {
  it('stores what the server returns', async () => {
    await useProjectStore.getState().loadProjects()

    expect(useProjectStore.getState().projects).toEqual([research])
  })

  it('records a failure without throwing', async () => {
    api.listProjects.mockRejectedValue(new Error('Network down'))

    await useProjectStore.getState().loadProjects()

    expect(useProjectStore.getState().error).toBe('Network down')
    expect(useProjectStore.getState().projects).toEqual([])
  })
})

describe('addProject', () => {
  it('puts the new project at the front of the list', async () => {
    useProjectStore.setState({ projects: [{ ...research, id: 'p0', name: 'Older' }] })

    await useProjectStore.getState().addProject('Research')

    expect(useProjectStore.getState().projects.map((p) => p.id)).toEqual(['p1', 'p0'])
    expect(api.createProject).toHaveBeenCalledExactlyOnceWith('Research')
  })
})

describe('renameProject', () => {
  it('replaces the renamed project in place', async () => {
    useProjectStore.setState({ projects: [research] })

    await useProjectStore.getState().renameProject('p1', 'Renamed')

    expect(useProjectStore.getState().projects[0].name).toBe('Renamed')
  })
})

describe('removeProject', () => {
  it('drops the project from the list', async () => {
    useProjectStore.setState({ projects: [research] })

    await useProjectStore.getState().removeProject('p1')

    expect(useProjectStore.getState().projects).toEqual([])
    expect(api.deleteProject).toHaveBeenCalledExactlyOnceWith('p1')
  })

  // A failed delete must not remove the row, or the sidebar shows something
  // gone that is still on the server until the next reload.
  it('keeps the project when the delete fails', async () => {
    api.deleteProject.mockRejectedValue(new Error('Project not found.'))
    useProjectStore.setState({ projects: [research] })

    await useProjectStore.getState().removeProject('p1')

    expect(useProjectStore.getState().projects).toEqual([research])
    expect(useProjectStore.getState().error).toBe('Project not found.')
  })
})

describe('reset', () => {
  it('clears everything for the next signed-in user', () => {
    useProjectStore.setState({ projects: [research], error: 'stale' })

    useProjectStore.getState().reset()

    expect(useProjectStore.getState().projects).toEqual([])
    expect(useProjectStore.getState().error).toBeNull()
  })
})
