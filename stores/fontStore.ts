import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FontAsset, FontStyle } from '~/shared/types/fontAssets'
import { useSiteStore } from '~/admin/stores/siteStore'
import { adminFetch } from '~/admin/utils/adminFetch'
import { extractFetchMessage } from '~/admin/utils/fetchError'
import { isRecord } from '~/shared/types/guards'

/**
 * Custom fonts (SPL-115) — editor-uploaded @font-face assets.
 * `fontsAvailable` flips to `false` when the feature flag is off server-side
 * so the UI can hide font management without tripping on 404s.
 */
export const useFontStore = defineStore('editor-font', () => {
  const siteStore = useSiteStore()

  const fonts = ref<FontAsset[]>([])
  const fontsLoaded = ref(false)
  const fontsAvailable = ref(true)
  const fontsUsedBytes = ref(0)
  const fontsQuotaBytes = ref(0)
  const fontsMaxFileBytes = ref(0)
  const fontsUploading = ref(false)
  const fontsError = ref<string | null>(null)

  async function fetchFonts() {
    if (!siteStore.activeSiteId) return
    fontsError.value = null
    try {
      const data = await adminFetch<{
        items: FontAsset[]
        usedBytes: number
        quotaBytes: number
        maxFileBytes: number
      }>(`${siteStore.apiBase}/fonts`)
      fonts.value = data.items || []
      fontsUsedBytes.value = data.usedBytes ?? 0
      fontsQuotaBytes.value = data.quotaBytes ?? 0
      fontsMaxFileBytes.value = data.maxFileBytes ?? 0
      fontsAvailable.value = true
      fontsLoaded.value = true
    } catch (e: unknown) {
      // 404 means the feature flag is off — hide the UI rather than error.
      const status404 = isRecord(e)
        && (e.statusCode === 404 || (isRecord(e.response) && e.response.status === 404))
      if (status404) {
        fontsAvailable.value = false
        fonts.value = []
        fontsLoaded.value = true
        return
      }
      fontsError.value = extractFetchMessage(e, 'Failed to fetch fonts')
    }
  }

  async function uploadFont(file: File, metadata: {
    name: string
    weight?: number
    style?: FontStyle
    fallbackStack?: string | null
  }): Promise<FontAsset | null> {
    if (!siteStore.activeSiteId) return null
    fontsUploading.value = true
    fontsError.value = null
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('name', metadata.name)
      if (metadata.weight !== undefined) form.append('weight', String(metadata.weight))
      if (metadata.style) form.append('style', metadata.style)
      if (metadata.fallbackStack) form.append('fallbackStack', metadata.fallbackStack)

      const created = await adminFetch<FontAsset>(
        `${siteStore.apiBase}/fonts/upload`,
        { method: 'POST', body: form },
      )
      // Optimistic local insert so the picker updates without a round-trip.
      fonts.value = [...fonts.value, created]
      fontsUsedBytes.value += created.fileSize
      return created
    } catch (e: unknown) {
      fontsError.value = extractFetchMessage(e, 'Font upload failed')
      return null
    } finally {
      fontsUploading.value = false
    }
  }

  async function deleteFont(fontId: string): Promise<boolean> {
    if (!siteStore.activeSiteId) return false
    fontsError.value = null
    try {
      await adminFetch(`${siteStore.apiBase}/fonts/${fontId}`, { method: 'DELETE' })
      const removed = fonts.value.find(f => f.id === fontId)
      fonts.value = fonts.value.filter(f => f.id !== fontId)
      if (removed) fontsUsedBytes.value = Math.max(0, fontsUsedBytes.value - removed.fileSize)
      return true
    } catch (e: unknown) {
      fontsError.value = extractFetchMessage(e, 'Font delete failed')
      return false
    }
  }

  return {
    fonts,
    fontsLoaded,
    fontsAvailable,
    fontsUsedBytes,
    fontsQuotaBytes,
    fontsMaxFileBytes,
    fontsUploading,
    fontsError,
    fetchFonts,
    uploadFont,
    deleteFont,
  }
})
