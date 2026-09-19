/**
 * The admin route registry — the single source of truth for which admin pages
 * exist.
 *
 * `dir.pages` points at the theme `pages/` tree, so a file under `admin/pages/**`
 * is NOT routed by its path. Every admin page must be listed here; dropping a
 * page file in without a line here renders the app's 404, and the nav entry
 * pointing at it goes with it.
 *
 * `nuxt.config.ts` registers these in its `pages:extend` hook. A test asserts
 * every entry is reachable from `navigation.ts` (see I1/I2 in
 * `docs/design/admin-architecture-lock.md`), so this list and the nav model
 * cannot drift apart.
 */

export const SITE_SCOPE_PREFIX = '/admin/p/:programId/s/:siteId'

export interface AdminRoute {
  name: string
  path: string
  file: string
}

export const adminRoutes: AdminRoute[] = [
  // ── Context-free (no program/site in the URL) ──
  { name: 'admin', path: '/admin', file: 'admin/pages/index.vue' },
  { name: 'admin-login', path: '/admin/login', file: 'admin/pages/login.vue' },
  { name: 'admin-new', path: '/admin/new', file: 'admin/pages/new.vue' },
  { name: 'admin-programs', path: '/admin/programs', file: 'admin/pages/programs.vue' },
  { name: 'admin-sites', path: '/admin/sites', file: 'admin/pages/sites.vue' },
  { name: 'admin-change-password', path: '/admin/change-password', file: 'admin/pages/change-password.vue' },
  { name: 'admin-forgot-password', path: '/admin/forgot-password', file: 'admin/pages/forgot-password.vue' },
  { name: 'admin-reset-password', path: '/admin/reset-password', file: 'admin/pages/reset-password.vue' },
  { name: 'admin-users', path: '/admin/users', file: 'admin/pages/users.vue' },

  // ── Program-level redirect ──
  { name: 'admin-program', path: '/admin/p/:programId', file: 'admin/pages/p/[programId]/index.vue' },

  // ── Site-scoped ──
  { name: 'admin-context', path: `${SITE_SCOPE_PREFIX}`, file: 'admin/pages/p/[programId]/s/[siteId]/index.vue' },
  { name: 'admin-context-site', path: `${SITE_SCOPE_PREFIX}/site`, file: 'admin/pages/p/[programId]/s/[siteId]/site.vue' },
  { name: 'admin-context-editor', path: `${SITE_SCOPE_PREFIX}/editor`, file: 'admin/pages/p/[programId]/s/[siteId]/editor.vue' },
  { name: 'admin-context-publish', path: `${SITE_SCOPE_PREFIX}/publish`, file: 'admin/pages/p/[programId]/s/[siteId]/publish.vue' },
  { name: 'admin-context-media', path: `${SITE_SCOPE_PREFIX}/media`, file: 'admin/pages/p/[programId]/s/[siteId]/media.vue' },
  { name: 'admin-context-typography', path: `${SITE_SCOPE_PREFIX}/typography`, file: 'admin/pages/p/[programId]/s/[siteId]/typography.vue' },
  { name: 'admin-context-brand-identity', path: `${SITE_SCOPE_PREFIX}/brand/identity`, file: 'admin/pages/p/[programId]/s/[siteId]/brand/identity.vue' },
  { name: 'admin-context-brand-assets', path: `${SITE_SCOPE_PREFIX}/brand/assets`, file: 'admin/pages/p/[programId]/s/[siteId]/brand/assets.vue' },
  { name: 'admin-context-brand-canvases', path: `${SITE_SCOPE_PREFIX}/brand/canvases`, file: 'admin/pages/p/[programId]/s/[siteId]/brand/canvases.vue' },
  { name: 'admin-context-settings-data', path: `${SITE_SCOPE_PREFIX}/settings/data-connections`, file: 'admin/pages/p/[programId]/s/[siteId]/settings/data-connections.vue' },
  { name: 'admin-context-pages', path: `${SITE_SCOPE_PREFIX}/pages`, file: 'admin/pages/p/[programId]/s/[siteId]/pages.vue' },
  { name: 'admin-context-articles', path: `${SITE_SCOPE_PREFIX}/articles`, file: 'admin/pages/p/[programId]/s/[siteId]/articles.vue' },
  { name: 'admin-context-articles-new', path: `${SITE_SCOPE_PREFIX}/articles/new`, file: 'admin/pages/p/[programId]/s/[siteId]/articles/new.vue' },
  { name: 'admin-context-article-edit', path: `${SITE_SCOPE_PREFIX}/articles/:articleId`, file: 'admin/pages/p/[programId]/s/[siteId]/articles/[articleId].vue' },
  { name: 'admin-context-blogs', path: `${SITE_SCOPE_PREFIX}/blogs`, file: 'admin/pages/p/[programId]/s/[siteId]/blogs.vue' },
  { name: 'admin-context-blogs-new', path: `${SITE_SCOPE_PREFIX}/blogs/new`, file: 'admin/pages/p/[programId]/s/[siteId]/blogs/new.vue' },
  { name: 'admin-context-blog-edit', path: `${SITE_SCOPE_PREFIX}/blogs/:blogId`, file: 'admin/pages/p/[programId]/s/[siteId]/blogs/[blogId].vue' },
  { name: 'admin-context-settings-activity', path: `${SITE_SCOPE_PREFIX}/settings/activity`, file: 'admin/pages/p/[programId]/s/[siteId]/settings/activity.vue' },
  { name: 'admin-context-settings-variables', path: `${SITE_SCOPE_PREFIX}/settings/variables`, file: 'admin/pages/p/[programId]/s/[siteId]/settings/variables.vue' },
  { name: 'admin-context-settings-domains', path: `${SITE_SCOPE_PREFIX}/settings/domains`, file: 'admin/pages/p/[programId]/s/[siteId]/settings/domains.vue' },
  { name: 'admin-context-settings-recovery', path: `${SITE_SCOPE_PREFIX}/settings/recovery`, file: 'admin/pages/p/[programId]/s/[siteId]/settings/recovery.vue' },
  { name: 'admin-context-layouts', path: `${SITE_SCOPE_PREFIX}/layouts`, file: 'admin/pages/p/[programId]/s/[siteId]/layouts.vue' },
]

/**
 * The nav-facing address of a route: the `to` suffix a `NavItem` would carry.
 * Site-scoped routes drop the program/site prefix; context-free routes keep
 * their `/admin`-relative suffix and are flagged so the two namespaces can't be
 * confused for one another.
 */
export function routeNavAddress(path: string): { suffix: string, contextFree: boolean } {
  if (path === SITE_SCOPE_PREFIX) return { suffix: '/', contextFree: false }
  if (path.startsWith(`${SITE_SCOPE_PREFIX}/`)) {
    return { suffix: path.slice(SITE_SCOPE_PREFIX.length), contextFree: false }
  }
  if (path === '/admin') return { suffix: '/', contextFree: true }
  return { suffix: path.slice('/admin'.length), contextFree: true }
}

/**
 * Old admin URLs, kept working after the Phase 6 route reshape.
 *
 * SSR is disabled, so a bookmarked URL boots the SPA and the client router
 * resolves it — server `routeRules` would not see an in-app navigation. A
 * global middleware calling this map covers both cases. Keys and values are
 * site-scoped SUFFIXES; the program/site prefix and any query are preserved by
 * the caller.
 */
const LEGACY_SUFFIXES: Record<string, string> = {
  '/brand-identity': '/brand/identity',
  '/brand-formats': '/brand/assets',
  '/brand-templates': '/brand/canvases',
  '/api-config': '/settings/data-connections',
  '/audit': '/settings/activity',
  '/env-variables': '/settings/variables',
  '/domains': '/settings/domains',
  '/migration-backups': '/settings/recovery',
  '/theme/layouts': '/layouts',
}

/**
 * Map a full admin path to its replacement, or null when it is already current.
 * Preserves the `/admin/p/:programId/s/:siteId` prefix and the query string.
 */
export function legacyAdminRedirect(fullPath: string): string | null {
  const [path, query] = fullPath.split('?')
  const match = path.match(/^(\/admin\/p\/[^/]+\/s\/[^/]+)(\/.*)$/)
  if (!match) return null
  const replacement = LEGACY_SUFFIXES[match[2]]
  if (!replacement) return null
  return `${match[1]}${replacement}${query ? `?${query}` : ''}`
}
