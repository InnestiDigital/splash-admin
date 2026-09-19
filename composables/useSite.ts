import { computed } from 'vue'
import { useSiteStore } from '~/admin/stores/siteStore'

export function useSite() {
  const siteStore = useSiteStore()

  const siteId = computed(() => siteStore.activeSiteId)
  const hasSite = computed(() => siteStore.hasSite)
  const siteName = computed(() => siteStore.activeSiteName)

  return { siteStore, siteId, hasSite, siteName }
}
