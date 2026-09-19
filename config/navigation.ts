import type { AdminRole } from '~/admin/types/auth'
import { filterNavByRole } from '~/admin/utils/filterNavByRole'

export interface NavItem {
  id: string
  label: string
  icon: string // Material Icons Outlined name
  to?: string  // Relative suffix, e.g. '/' or '/pages'. Resolved by useAdminUrl().
  /**
   * One-line explanation of what the destination is for. Presence is the opt-in
   * that puts a destination on the site home task grid — role filtering then
   * decides which cards each role actually sees, so the grid is derived rather
   * than curated a second time.
   */
  description?: string
  /**
   * Roles that can see this item. Omitted **or** empty array = visible to all
   * authenticated roles. Non-empty = visible only to the listed roles.
   */
  roles?: AdminRole[]
  children?: NavItem[]
  /**
   * If true, this item links to a context-free admin page (e.g. /admin/programs)
   * that doesn't require program/site IDs in the URL.
   */
  contextFree?: boolean
  /**
   * Reachable, but deliberately not offered in the sidebar or command palette —
   * a detail route, a create form, or a redirect. Still contributes its label to
   * the breadcrumb, so a hidden route is *named*, never a bare path.
   *
   * Requires `hiddenReason`. A route that is neither listed nor hidden is a bug
   * (I2 in docs/design/admin-architecture-lock.md) and fails the coverage test.
   */
  hidden?: boolean
  hiddenReason?: string
}

/** Locale keys stay separate from route identity so access-policy tests and URLs remain stable. */
const NAV_LABEL_KEYS: Record<string, string> = {
  home: 'home', content: 'content', pages: 'pages', blogs: 'blogs', articles: 'articles',
  appearance: 'design', editor: 'siteEditor', typography: 'typography', 'theme-layouts': 'layouts',
  'brand-studio': 'assets', media: 'media', 'brand-identity': 'brandSettings',
  'brand-formats': 'createBrandAssets', 'brand-templates': 'brandCanvases', settings: 'settings',
  publish: 'publish', sites: 'websites', programs: 'workspaces', users: 'people',
  'settings-domains': 'domains', domains: 'domains', 'audit-log': 'activity',
  'settings-api-config': 'dataConnections', 'api-config': 'dataConnections',
  'settings-env-variables': 'siteVariables', 'env-variables': 'siteVariables',
  'migration-backups': 'recovery', overview: 'siteOverview',
  'blog-new': 'newBlog', 'blog-edit': 'editBlog', 'article-new': 'newArticle', 'article-edit': 'editArticle',
}

export function adminNavLabel(item: NavItem, translate: (key: string, fallback: string) => string): string {
  const key = NAV_LABEL_KEYS[item.id]
  return key ? translate(`admin.nav.${key}`, item.label) : item.label
}

/**
 * Top-level navigation items.
 *
 * `to` values are **suffixes** — the AdminNavTree component prepends the
 * program/site context prefix via `useAdminUrl().adminUrl(to)`.
 *
 * Items marked `contextFree: true` are resolved as `/admin${to}` instead.
 */
export const navigationItems: NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: 'home',
    to: '/',
    roles: ['admin', 'editor', 'viewer', 'client'],
  },
  {
    id: 'content',
    label: 'Content',
    icon: 'description',
    roles: ['admin', 'editor'],
    children: [
      {
        id: 'pages',
        label: 'Pages',
        icon: 'article',
        to: '/pages',
        description: 'Create and organize website pages.',
        // Blog-2: Pages admin-only — editors use Blogs/Articles entries
        roles: ['admin'],
      },
      {
        id: 'blogs',
        label: 'Blogs',
        icon: 'feed',
        to: '/blogs',
        description: 'Organize blog collections and settings.',
        roles: ['admin', 'editor'],
        children: [
          {
            id: 'blog-new',
            label: 'New blog',
            icon: 'add',
            to: '/blogs/new',
            roles: ['admin', 'editor'],
            hidden: true,
            hiddenReason: 'Create form, reached from the Blogs list',
          },
          {
            id: 'blog-edit',
            label: 'Edit blog',
            icon: 'edit',
            to: '/blogs/:blogId',
            roles: ['admin', 'editor'],
            hidden: true,
            hiddenReason: 'Detail route, reached from the Blogs list',
          },
        ],
      },
      {
        id: 'articles',
        label: 'Articles',
        icon: 'newspaper',
        to: '/articles',
        description: 'Create and update article content.',
        roles: ['admin', 'editor'],
        children: [
          {
            id: 'article-new',
            label: 'New article',
            icon: 'add',
            to: '/articles/new',
            roles: ['admin', 'editor'],
            hidden: true,
            hiddenReason: 'Create form, reached from the Articles list',
          },
          {
            id: 'article-edit',
            label: 'Edit article',
            icon: 'edit',
            to: '/articles/:articleId',
            roles: ['admin', 'editor'],
            hidden: true,
            hiddenReason: 'Detail route, reached from the Articles list',
          },
        ],
      },
    ],
  },
  {
    id: 'appearance',
    label: 'Design',
    icon: 'palette',
    roles: ['admin', 'editor'],
    children: [
      {
        id: 'editor',
        label: 'Site editor',
        icon: 'edit_note',
        to: '/editor',
        description: 'Edit pages, sections, content, and site-wide styles in one workspace.',
        roles: ['admin', 'editor'],
      },
      {
        id: 'typography',
        label: 'Typography',
        icon: 'text_format',
        to: '/typography',
        roles: ['admin'],
      },
      {
        id: 'theme-layouts',
        label: 'Layouts',
        icon: 'space_dashboard',
        to: '/layouts',
        roles: ['admin'],
      },
    ],
  },
  {
    id: 'brand-studio',
    label: 'Assets',
    icon: 'perm_media',
    roles: ['admin', 'editor', 'client'],
    children: [
      {
        id: 'media',
        label: 'Media',
        icon: 'image',
        to: '/media',
        description: 'Upload and reuse images and files.',
        roles: ['admin', 'editor'],
      },
      {
        id: 'brand-identity',
        label: 'Brand settings',
        icon: 'branding_watermark',
        to: '/brand/identity',
        roles: ['admin'],
      },
      {
        id: 'brand-formats',
        label: 'Create brand assets',
        icon: 'aspect_ratio',
        to: '/brand/assets',
        description: 'Generate images from your approved brand canvases.',
        // Editors generate from approved canvases too (render/save are in
        // EDITOR_WRITE_ALLOWED_PATTERNS); canvas AUTHORING stays admin-only.
        roles: ['admin', 'editor', 'client'],
      },
      {
        id: 'brand-templates',
        label: 'Brand canvases',
        icon: 'dashboard_customize',
        to: '/brand/canvases',
        roles: ['admin'],
      },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    roles: ['admin'],
    children: [
      {
        id: 'publish', label: 'Publish & versions', icon: 'publish', to: '/publish',
        description: 'Review changes and make them live.',
        roles: ['admin'],
      },
      { id: 'sites', label: 'Websites', icon: 'language', to: '/sites', roles: ['admin'], contextFree: true },
      { id: 'programs', label: 'Workspaces', icon: 'business', to: '/programs', roles: ['admin'], contextFree: true },
      { id: 'users', label: 'People & access', icon: 'group', to: '/users', roles: ['admin'], contextFree: true },
      { id: 'settings-domains', label: 'Domains', icon: 'dns', to: '/settings/domains', roles: ['admin'] },
      { id: 'audit-log', label: 'Activity', icon: 'history', to: '/settings/activity', roles: ['admin'] },
      {
        id: 'settings-api-config',
        label: 'Data connections',
        icon: 'api',
        to: '/settings/data-connections',
        roles: ['admin'],
      },
      {
        id: 'settings-env-variables',
        label: 'Site variables',
        icon: 'tune',
        to: '/settings/variables',
        roles: ['admin'],
      },
      {
        id: 'migration-backups',
        label: 'Recovery',
        icon: 'restore_page',
        to: '/settings/recovery',
        roles: ['admin'],
      },
    ],
  },

  {
    id: 'overview', label: 'Site overview', icon: 'dashboard', to: '/site',
    roles: ['admin'], hidden: true,
    hiddenReason: 'Legacy overview route; Home is the primary entry point',
  },

  // Compatibility aliases keep role-policy consumers stable while the visible
  // information architecture presents one Settings destination.
  {
    id: 'administration', label: 'Administration', icon: 'settings', roles: ['admin'],
    hidden: true, hiddenReason: 'Merged into Settings',
    children: [
      { id: 'domains', label: 'Domains', icon: 'dns', to: '/settings/domains', roles: ['admin'] },
    ],
  },
  {
    id: 'advanced', label: 'Advanced', icon: 'construction', roles: ['admin'],
    hidden: true, hiddenReason: 'Merged into Settings',
    children: [
      { id: 'api-config', label: 'Data connections', icon: 'api', to: '/settings/data-connections', roles: ['admin'] },
      { id: 'env-variables', label: 'Site variables', icon: 'tune', to: '/settings/variables', roles: ['admin'] },
    ],
  },

  // ── Reachable, deliberately not offered in the sidebar ──
  {
    id: 'site-create',
    label: 'Create a website',
    icon: 'add_circle',
    to: '/new',
    roles: ['admin'],
    contextFree: true,
    hidden: true,
    hiddenReason: 'Create flow, reached from the Websites list and the sidebar action',
  },
  {
    id: 'change-password',
    label: 'Change password',
    icon: 'password',
    to: '/change-password',
    contextFree: true,
    hidden: true,
    hiddenReason: 'Account flow, reached from the user menu and the forced-change redirect',
  },
  {
    id: 'login',
    label: 'Sign in',
    icon: 'login',
    to: '/login',
    contextFree: true,
    hidden: true,
    hiddenReason: 'Unauthenticated entry point, outside the admin shell',
  },
  {
    id: 'forgot-password',
    label: 'Forgot password',
    icon: 'lock_reset',
    to: '/forgot-password',
    contextFree: true,
    hidden: true,
    hiddenReason: 'Unauthenticated recovery entry point, reached from the sign-in page',
  },
  {
    id: 'reset-password',
    label: 'Reset password',
    icon: 'password',
    to: '/reset-password',
    contextFree: true,
    hidden: true,
    hiddenReason: 'Unauthenticated recovery target, reached from the emailed reset link',
  },
  {
    id: 'admin-root',
    label: 'Admin',
    icon: 'home',
    to: '/',
    contextFree: true,
    hidden: true,
    hiddenReason: 'Bootstrap redirect: restores the last program/site, then forwards',
  },
  {
    id: 'program-root',
    label: 'Workspace',
    icon: 'business',
    to: '/p/:programId',
    contextFree: true,
    hidden: true,
    hiddenReason: 'Redirect to the websites list for the given workspace',
  },
]

// ── Derivation ───────────────────────────────────────────────────────────────
// The breadcrumb, the command palette and the home task grid all read the tree
// through these helpers. None of them keeps its own label map, its own role
// filter, or its own copy of the destination list (I1).

/** A nav item plus the ancestors that lead to it, outermost first. */
export interface NavMatch {
  item: NavItem
  trail: NavItem[]
}

function stripQuery(to: string): string {
  const q = to.indexOf('?')
  return q === -1 ? to : to.slice(0, q)
}

/**
 * Does a concrete suffix (`/articles/abc`) satisfy a nav `to` pattern
 * (`/articles/:articleId`)? Segment counts must match; `:param` segments match
 * any single non-empty segment.
 */
export function navPathMatches(pattern: string, suffix: string): boolean {
  const p = stripQuery(pattern).split('/')
  const s = stripQuery(suffix).split('/')
  if (p.length !== s.length) return false
  return p.every((seg, i) => (seg.startsWith(':') ? s[i] !== '' : seg === s[i]))
}

/**
 * Find the nav item addressing a suffix, with its ancestor trail. Exact matches
 * win over parameterised ones, so `/articles/new` resolves to the create form
 * rather than to `/articles/:articleId`.
 */
export function findNavMatch(
  suffix: string,
  contextFree = false,
  items: NavItem[] = navigationItems,
): NavMatch | null {
  const exact: NavMatch[] = []
  const param: NavMatch[] = []

  const walk = (list: NavItem[], trail: NavItem[]) => {
    for (const item of list) {
      if (item.to !== undefined && Boolean(item.contextFree) === contextFree) {
        if (navPathMatches(item.to, suffix)) {
          ;(stripQuery(item.to).includes('/:') ? param : exact).push({ item, trail })
        }
      }
      if (item.children) walk(item.children, [...trail, item])
    }
  }
  walk(items, [])

  return exact[0] ?? param[0] ?? null
}

/**
 * The tree a role may see: role filtering (delegated to the single tested
 * implementation in `filterNavByRole`) with hidden items and now-empty
 * groupings removed. A parent with children but no `to` is a grouping — it
 * disappears once every child is filtered out, rather than rendering as a dead
 * heading.
 */
export function visibleNavForRole(
  role: AdminRole | undefined,
  items: NavItem[] = navigationItems,
): NavItem[] {
  const stripHidden = (list: NavItem[]): NavItem[] => {
    const result: NavItem[] = []
    for (const item of list) {
      if (item.hidden) continue
      const children = item.children ? stripHidden(item.children) : undefined
      if (item.to === undefined && (!children || children.length === 0)) continue
      result.push({ ...item, children: children && children.length > 0 ? children : undefined })
    }
    return result
  }
  return stripHidden(filterNavByRole(items, role))
}

/** Every navigable destination a role may see, flattened — for the palette. */
export function flattenNavForRole(
  role: AdminRole | undefined,
  items: NavItem[] = navigationItems,
): NavItem[] {
  const out: NavItem[] = []
  const walk = (list: NavItem[]) => {
    for (const item of list) {
      if (item.to !== undefined) out.push(item)
      if (item.children) walk(item.children)
    }
  }
  walk(visibleNavForRole(role, items))
  return out
}
