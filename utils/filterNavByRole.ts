import type { AdminRole } from '~/admin/types/auth'
import type { NavItem } from '~/admin/config/navigation'

/**
 * Recursively filters a nav tree to items visible to `role`.
 *
 * Visibility rules:
 * - `roles` omitted **or** empty array → visible to every role
 * - `roles` non-empty → visible only when `role` is in the list
 * - A parent whose every child is filtered out gets `children: undefined`
 *   so it is also removed from the tree.
 *
 * Returns `[]` when `role` is falsy (unauthenticated).
 */
export function filterNavByRole(items: NavItem[], role: AdminRole | undefined): NavItem[] {
  if (!role) return []

  return items
    .filter((item) => {
      if (item.roles && item.roles.length > 0 && !item.roles.includes(role)) return false
      return true
    })
    .map((item) => {
      if (!item.children) return item
      const children = filterNavByRole(item.children, role)
      return { ...item, children: children.length > 0 ? children : undefined }
    })
}
