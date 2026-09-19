import { getCsrfToken } from './csrf'

/**
 * Drop-in replacement for $fetch that automatically attaches the CSRF token
 * header. Used by Pinia stores that make direct API calls outside of useSiteApi.
 */
export function adminFetch<T>(url: string, opts?: Parameters<typeof $fetch>[1]): Promise<T> {
  const csrfToken = getCsrfToken()
  const headers: Record<string, string> = {
    ...(opts?.headers as Record<string, string> || {}),
  }
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }
  return $fetch<T>(url, { ...opts, headers })
}
