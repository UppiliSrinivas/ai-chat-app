import { apiFetch } from './client'

export type ProjectSummary = {
  id: string
  name: string
  chatCount: number
  updatedAt: string
}

export function createProject(name?: string): Promise<ProjectSummary> {
  return apiFetch('/projects', { method: 'POST', body: JSON.stringify(name ? { name } : {}) })
}

export function listProjects(): Promise<ProjectSummary[]> {
  return apiFetch('/projects')
}

export function renameProject(id: string, name: string): Promise<ProjectSummary> {
  return apiFetch(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
}

export function deleteProject(id: string): Promise<void> {
  return apiFetch(`/projects/${id}`, { method: 'DELETE' })
}
