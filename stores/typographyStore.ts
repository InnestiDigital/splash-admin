import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { TypographyPreset, TypographySnapshotRoles, TypographyRoleMapping } from '~/server/services/typography/typographyTypes'
import { useSiteStore } from '~/admin/stores/siteStore'
import { adminFetch } from '~/admin/utils/adminFetch'

export const useTypographyStore = defineStore('editor-typography', () => {
  const siteStore = useSiteStore()

  // Admin endpoints return full TypographyPreset (with isActive, isBlockOverrideEligible).
  // Use the full type here; TypographySnapshotPreset is for published/preview contexts only.
  const typographyPresets = ref<TypographyPreset[]>([])
  const typographyRoles = ref<TypographySnapshotRoles>({})

  async function fetchTypographyPresets() {
    if (!siteStore.activeSiteId) return
    try {
      const data = await adminFetch<{ presets: TypographyPreset[] }>(
        `${siteStore.apiBase}/typography/presets`,
      )
      typographyPresets.value = data.presets ?? []
    } catch (e: any) {
      console.warn('[typographyStore] Failed to fetch typography presets:', e.message)
      typographyPresets.value = []
    }
  }

  async function fetchTypographyRoles() {
    if (!siteStore.activeSiteId) return
    try {
      const data = await adminFetch<{ roles: TypographyRoleMapping[] }>(
        `${siteStore.apiBase}/typography/roles`,
      )
      // Normalize array of role mappings to TypographySnapshotRoles shape
      const normalized: TypographySnapshotRoles = {}
      for (const mapping of data.roles ?? []) {
        normalized[mapping.role] = mapping.presetKey
      }
      typographyRoles.value = normalized
    } catch (e: any) {
      console.warn('[typographyStore] Failed to fetch typography roles:', e.message)
      typographyRoles.value = {}
    }
  }

  return {
    typographyPresets,
    typographyRoles,
    fetchTypographyPresets,
    fetchTypographyRoles,
  }
})
