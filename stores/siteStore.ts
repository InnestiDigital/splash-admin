import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SiteSummary } from '~/server/storage/types'
import { extractFetchMessage } from '~/admin/utils/fetchError'

const SITE_STORAGE_KEY = 'cms_active_site'

export const useSiteStore = defineStore('site', () => {
  // State
  const activeSiteId = ref<string | null>(null)
  const activeSiteName = ref<string>('')
  const activeSiteTheme = ref<string>('')
  const sites = ref<SiteSummary[]>([])
  const loading = ref(false)
  const initialized = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const hasSite = computed(() => activeSiteId.value !== null)

  const apiBase = computed(() =>
    activeSiteId.value ? `/api/admin/s/${activeSiteId.value}` : null,
  )

  const activeSite = computed(() =>
    sites.value.find(s => s.id === activeSiteId.value) ?? null,
  )

  // Actions

  function setSite(site: { id: string; name: string; theme?: string }) {
    activeSiteId.value = site.id
    activeSiteName.value = site.name
    activeSiteTheme.value = site.theme || ''

    if (import.meta.client) {
      localStorage.setItem(SITE_STORAGE_KEY, JSON.stringify({
        id: site.id,
        name: site.name,
        theme: site.theme || '',
      }))
    }
  }

  /**
   * Adopt a site list resolved elsewhere. Used by the caller-scoped shell
   * bootstrap (`GET /api/admin/me/context`), which reaches the same records
   * through an endpoint the 'client' role is allowed to call — `fetchSites`
   * below hits `/api/admin/sites`, which is admin-only. Deliberately does NOT
   * auto-select: the caller validates the route's siteId against this list
   * first, so an unknown id must fail the sync rather than land on some site.
   */
  function setSites(list: SiteSummary[]) {
    sites.value = list
    initialized.value = true
  }

  async function fetchSites(programId?: string) {
    loading.value = true
    error.value = null
    try {
      const params = programId ? { programId } : {}
      const data = await $fetch<{ sites: SiteSummary[] }>('/api/admin/sites', { params })
      sites.value = data.sites || []

      // If current selection is no longer in the list, auto-select first
      if (activeSiteId.value && !sites.value.some(s => s.id === activeSiteId.value)) {
        if (sites.value.length > 0) {
          setSite(sites.value[0])
        } else {
          clearSite()
        }
      }

      initialized.value = true
      return sites.value
    } catch (e: unknown) {
      error.value = extractFetchMessage(e, 'Failed to load sites')
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchSite() {
    await fetchSites()
    // Auto-select first site if none selected (backward compatibility)
    if (!activeSiteId.value && sites.value.length > 0) {
      setSite(sites.value[0])
    }
  }

  async function onProgramChange(programId: string) {
    const result = await fetchSites(programId)
    if (result.length > 0) {
      setSite(result[0])
    } else {
      clearSite()
    }
  }

  function restoreFromStorage() {
    if (!import.meta.client) return
    const saved = localStorage.getItem(SITE_STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        activeSiteId.value = parsed.id
        activeSiteName.value = parsed.name || ''
        activeSiteTheme.value = parsed.theme || ''
      } catch {
        localStorage.removeItem(SITE_STORAGE_KEY)
      }
    }
  }

  function requireSiteId(): string {
    if (!activeSiteId.value) {
      throw new Error('No site selected')
    }
    return activeSiteId.value
  }

  function clearSite() {
    activeSiteId.value = null
    activeSiteName.value = ''
    activeSiteTheme.value = ''
    sites.value = []
    if (import.meta.client) {
      localStorage.removeItem(SITE_STORAGE_KEY)
    }
  }

  return {
    // State
    activeSiteId,
    activeSiteName,
    activeSiteTheme,
    sites,
    loading,
    initialized,
    error,
    // Computed
    hasSite,
    apiBase,
    activeSite,
    // Actions
    setSite,
    setSites,
    fetchSites,
    fetchSite,
    onProgramChange,
    restoreFromStorage,
    requireSiteId,
    clearSite,
  }
})
