import { computed } from 'vue'
import { useSiteStore } from '~/admin/stores/siteStore'
import { getCsrfToken } from '~/admin/utils/csrf'

export function useSiteApi() {
  const siteStore = useSiteStore()

  const siteId = computed(() => siteStore.activeSiteId)
  const hasSite = computed(() => siteStore.hasSite)

  /** Returns the site-scoped API base URL. Delegates to siteStore.apiBase. */
  function apiBase(): string {
    const base = siteStore.apiBase
    if (!base) throw new Error('No site selected')
    return base
  }

  async function siteFetch<T>(path: string, opts?: Parameters<typeof $fetch>[1]): Promise<T> {
    const csrfToken = getCsrfToken()
    const headers: Record<string, string> = {
      ...(opts?.headers as Record<string, string> || {}),
    }
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }
    return $fetch<T>(`${apiBase()}${path}`, { ...opts, headers })
  }

  return { apiBase, siteFetch, siteId, hasSite }
}
