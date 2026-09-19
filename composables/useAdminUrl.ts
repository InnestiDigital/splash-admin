import { useProgramStore } from '~/admin/stores/programStore'
import { useSiteStore } from '~/admin/stores/siteStore'

/**
 * Composable that centralises admin URL generation.
 *
 * All admin links and `navigateTo()` calls should use `adminUrl(suffix)`
 * so that the current program + site context is always encoded in the path.
 *
 * Example:
 *   adminUrl('/pages')  → /admin/p/<pid>/s/<sid>/pages
 *   adminUrl('/')       → /admin/p/<pid>/s/<sid>/
 */
export function useAdminUrl() {
  const programStore = useProgramStore()
  const siteStore = useSiteStore()

  /**
   * Build a full admin path that includes the active program and site IDs.
   *
   * @param path - The page suffix, e.g. '/pages', '/editor', '/'
   * @returns The fully-qualified admin URL
   */
  function adminUrl(path: string): string {
    const pid = programStore.activeProgramId
    const sid = siteStore.activeSiteId
    if (pid && sid) return `/admin/p/${pid}/s/${sid}${path}`
    if (pid) return `/admin/p/${pid}${path}`
    return `/admin${path}`
  }

  /**
   * Extract the page suffix from a full admin route path.
   *
   * Example:
   *   extractSuffix('/admin/p/abc/s/xyz/pages') → '/pages'
   *   extractSuffix('/admin/pages')             → '/pages'
   */
  function extractSuffix(fullPath: string): string {
    // Match /admin/p/<pid>/s/<sid><suffix>
    const contextMatch = fullPath.match(/^\/admin\/p\/[^/]+\/s\/[^/]+(\/.*)$/)
    if (contextMatch) return contextMatch[1]

    // Match /admin/p/<pid><suffix>
    const programMatch = fullPath.match(/^\/admin\/p\/[^/]+(\/.*)$/)
    if (programMatch) return programMatch[1]

    // Match /admin<suffix>
    const adminMatch = fullPath.match(/^\/admin(\/.*)$/)
    if (adminMatch) return adminMatch[1]

    return '/'
  }

  return { adminUrl, extractSuffix }
}
