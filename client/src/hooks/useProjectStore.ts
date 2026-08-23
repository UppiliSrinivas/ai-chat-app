import { create } from 'zustand'
import {
  createProject,
  deleteProject,
  listProjects,
  renameProject as renameProjectRequest,
  type ProjectSummary,
} from '../api/projects'

type ProjectState = {
  projects: ProjectSummary[]
  error: string | null
  loadProjects: () => Promise<void>
  addProject: (name?: string) => Promise<void>
  renameProject: (id: string, name: string) => Promise<void>
  removeProject: (id: string) => Promise<void>
  reset: () => void
}

const messageFor = (error: unknown): string =>
  error instanceof Error ? error.message : 'Something went wrong'

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  error: null,

  loadProjects: async () => {
    try {
      set({ projects: await listProjects(), error: null })
    } catch (error) {
      set({ error: messageFor(error) })
    }
  },

  addProject: async (name) => {
    try {
      const project = await createProject(name)
      set({ projects: [project, ...get().projects], error: null })
    } catch (error) {
      set({ error: messageFor(error) })
    }
  },

  renameProject: async (id, name) => {
    try {
      const updated = await renameProjectRequest(id, name)
      set({
        projects: get().projects.map((project) => (project.id === id ? updated : project)),
        error: null,
      })
    } catch (error) {
      set({ error: messageFor(error) })
    }
  },

  // Removed only after the server confirms — dropping the row first would
  // show a project gone that still exists until the next reload.
  removeProject: async (id) => {
    try {
      await deleteProject(id)
      set({ projects: get().projects.filter((project) => project.id !== id), error: null })
    } catch (error) {
      set({ error: messageFor(error) })
    }
  },

  reset: () => set({ projects: [], error: null }),
}))
