import { startTransition, useOptimistic } from 'react'
import { applySidebarEdit, type SidebarEdit, type SidebarLists } from '../lib/sidebarEdits'

/**
 * Shows a delete or rename the moment it's asked for. React drops the
 * optimistic copy when the request settles, so a failed one puts the row back.
 */
export function useOptimisticSidebar(lists: SidebarLists) {
  const [visibleLists, showOptimistically] = useOptimistic(lists, applySidebarEdit)

  const runEdit = (edit: SidebarEdit, request: () => Promise<void>) => {
    startTransition(async () => {
      showOptimistically(edit)
      // The stores report their own failures; a stray rejection must not crash the sidebar.
      await request().catch(() => {})
    })
  }

  return { visibleLists, runEdit }
}
