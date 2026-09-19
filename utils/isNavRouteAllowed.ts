import type { NavItem } from '~/admin/config/navigation'
import type { AdminRole } from '~/admin/types/auth'

/**
 * A route's query as Vue Router hands it in — string, string[] or null per
 * key. We only ever compare a declared `to` query param (e.g. `mode=theme`)
 * against the actual value, so nothing here needs to know more than that.
 */
export type NavRouteQuery = Record<string, string | string[] | null | undefined>

/** Split a nav item's `to` suffix into its path and, if present, its query. */
function parseTo(to: string): { path: string; query: URLSearchParams | null } {
  const [path, queryStr] = to.split('?')
  return { path: path ?? '', query: queryStr ? new URLSearchParams(queryStr) : null }
}

/** Every declared `key=value` pair in the nav item's `to` must match the route's actual query. */
function queryMatches(declared: URLSearchParams | null, actual: NavRouteQuery): boolean {
  if (!declared) return true
  for (const [key, value] of declared.entries()) {
    if (String(actual[key] ?? '') !== value) return false
  }
  return true
}

/**
 * Whether `role` may open the admin page at `suffix` (+ `query`), per the
 * declared nav tree — the same `roles` a client-side link visibility check
 * already reads (`filterNavByRole`), used here to gate the destination
 * itself rather than just the link to it.
 *
 * A page a client reaches by TYPING THE URL never runs the nav's visibility
 * filter, so hiding an item from the tree (e.g. brand-templates from
 * `client`) does not, on its own, stop that role from opening the page and
 * seeing the full admin chrome — server routes refuse the writes, but the
 * buttons and forms render regardless. This closes that gap for any page a
 * nav item names.
 *
 * Returns:
 * - `true` / `false` — a nav item's `to` matches this exact path (+ query),
 *   and its `roles` does/does not include `role`. Two nav items can name the
 *   same path with different roles (e.g. a query-filtered variant); any
 *   match that allows the role wins.
 * - `undefined` — no nav item references this path at all. Most routes are
 *   opened from a list/link rather than the nav tree (e.g. `/editor?pageId=…`
 *   for a specific page), so an unmatched route is not guarded here — it
 *   relies on server-side RBAC alone, exactly as before this check existed.
 */
export function isNavRouteAllowed(
  items: NavItem[],
  suffix: string,
  query: NavRouteQuery,
  role: AdminRole | undefined,
): boolean | undefined {
  // Mirrors `rbac.ts`'s own admin bypass ("Admin can do everything"): admin is
  // unconditionally allowed, never gated by a nav item's `roles`. This also
  // sidesteps a real ambiguity in the nav data — some paths (the site root
  // `/`) are a shared per-role dashboard where the ONLY item naming that path
  // omits 'admin' from `roles` (admin gets there via the icon-strip logo link
  // and a differently-suffixed 'Overview' entry, not the 'Home' row) — that
  // omission means "don't show admin this nav ROW", not "admin may not open
  // this PAGE". Treating admin as sometimes-excluded would misread that as a
  // block on their own dashboard.
  if (role === 'admin') return true

  let matched = false
  let allowed = false

  for (const item of items) {
    // Context-free items are matched too: `extractSuffix()` strips the /admin
    // prefix from both namespaces, so '/users' reaches here for the
    // context-free People & access page and must stay guarded.
    if (item.to) {
      const { path, query: declaredQuery } = parseTo(item.to)
      if (path === suffix && queryMatches(declaredQuery, query)) {
        matched = true
        if (!item.roles || item.roles.length === 0 || (!!role && item.roles.includes(role))) {
          allowed = true
        }
      }
    }
    if (item.children) {
      const childResult = isNavRouteAllowed(item.children, suffix, query, role)
      if (childResult !== undefined) {
        matched = true
        if (childResult) allowed = true
      }
    }
  }

  if (!matched) return undefined
  return allowed
}
