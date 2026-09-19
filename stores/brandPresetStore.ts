import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useSiteStore } from '~/admin/stores/siteStore'
import { adminFetch } from '~/admin/utils/adminFetch'
import { extractFetchMessage } from '~/admin/utils/fetchError'
import {
  BRAND_PRESET_NAME_MAX_LENGTH,
  type BrandPresetCreateRequest,
  type BrandPresetDeleteResponse,
  type BrandPresetListResponse,
  type BrandPresetRenameRequest,
  type BrandPresetSummary,
} from '~/shared/types/brand'

/** Trims and length-checks an author-typed preset name; `null` = not sendable. */
function normalizePresetName(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0 || trimmed.length > BRAND_PRESET_NAME_MAX_LENGTH) return null
  return trimmed
}

/**
 * Brand Content Studio — the single source of truth for a site's named brand
 * presets.
 *
 * Consolidates what `brandFormatStore` (the generate-side selector) and
 * `brandIdentityStore` (the authoring form) each carried a full copy of: the
 * list, `activePresetId`, and the create/rename/delete mutations. A preset
 * created or renamed on the Brand settings page now reflects on the
 * Create-assets page without a reload, because both pages read the same
 * `presets` ref rather than two lists on independent refresh schedules.
 *
 * `load()` and `select()` cover the read side both callers need identically.
 * The two call sites still legitimately diverge on what a `null` selection
 * MEANS — `brandFormatStore.presetScope()` treats it as the wire's own
 * "site default" and omits the param; `brandIdentityStore.presetQuery()`
 * would rather resolve eagerly. That divergence stays local to each store as
 * a small derivation function, not duplicated here.
 */
export const useBrandPresetStore = defineStore('brandPresets', () => {
  const siteStore = useSiteStore()

  const presets = ref<BrandPresetSummary[]>([])
  /** `null` before any list has resolved, or when nothing is selected yet. */
  const activePresetId = ref<string | null>(null)
  const loading = ref(false)
  const mutating = ref(false)
  const error = ref<string | null>(null)
  let scopeBase: string | null = null
  let loadRequest = 0

  /**
   * Lists the site's presets, oldest (= default) first, and names the default
   * so a fresh page never shows a blank selector. A failure is reported on
   * `error` and the list is cleared — callers still work single-preset when
   * the list endpoint is down, the same as before consolidation.
   */
  async function load(): Promise<void> {
    const base = siteStore.apiBase
    const request = ++loadRequest
    if (scopeBase !== base) {
      scopeBase = base
      presets.value = []
      activePresetId.value = null
      loading.value = false
      error.value = null
    }
    if (!base) {
      error.value = 'No site is selected, so there are no brand presets to list.'
      return
    }
    const isCurrentRequest = (): boolean => request === loadRequest && siteStore.apiBase === base
    loading.value = true
    error.value = null
    try {
      const response = await adminFetch<BrandPresetListResponse>(`${base}/brand-presets`)
      if (!isCurrentRequest()) return
      presets.value = response.presets
      // The first preset IS the site default — the same one every preset-less
      // request resolves to, so naming it changes nothing but the label.
      const defaultPreset = response.presets[0]
      if (activePresetId.value === null && defaultPreset) activePresetId.value = defaultPreset.presetId
    } catch (e: unknown) {
      if (!isCurrentRequest()) return
      error.value = extractFetchMessage(e, 'Failed to load the brand presets')
      presets.value = []
    } finally {
      if (request === loadRequest) loading.value = false
    }
  }

  /**
   * Switches the active preset. Callers that also need to reload data scoped
   * to it (the brand contract, an identity record) do that themselves right
   * after — this store only owns the selection.
   */
  function select(presetId: string | null): void {
    activePresetId.value = presetId
  }

  /** Clears the list and selection back to "nothing loaded yet". Call on a site switch. */
  function reset(): void {
    loadRequest += 1
    scopeBase = null
    presets.value = []
    activePresetId.value = null
    loading.value = false
    error.value = null
  }

  watch(
    () => siteStore.apiBase,
    () => reset(),
    { flush: 'sync' },
  )

  /** Returns true when the create landed; the message is in `error` otherwise. */
  async function createPreset(name: string, cloneFrom?: string): Promise<boolean> {
    const base = siteStore.apiBase
    if (!base) return false
    const presetName = normalizePresetName(name)
    if (presetName === null) {
      error.value = `Preset name must be 1-${BRAND_PRESET_NAME_MAX_LENGTH} characters`
      return false
    }
    mutating.value = true
    error.value = null
    try {
      const payload: BrandPresetCreateRequest = cloneFrom === undefined
        ? { presetName }
        : { presetName, cloneFrom }
      const created = await adminFetch<BrandPresetSummary>(
        `${base}/brand-presets`,
        { method: 'POST', body: payload },
      )
      await load()
      activePresetId.value = created.presetId
      return true
    } catch (e: unknown) {
      error.value = extractFetchMessage(e, 'Failed to create the brand preset')
      return false
    } finally {
      mutating.value = false
    }
  }

  /** Returns true when the rename landed; the message is in `error` otherwise. */
  async function renamePreset(presetId: string, name: string): Promise<boolean> {
    const base = siteStore.apiBase
    if (!base) return false
    const presetName = normalizePresetName(name)
    if (presetName === null) {
      error.value = `Preset name must be 1-${BRAND_PRESET_NAME_MAX_LENGTH} characters`
      return false
    }
    mutating.value = true
    error.value = null
    try {
      const payload: BrandPresetRenameRequest = { presetName }
      await adminFetch<BrandPresetSummary>(
        `${base}/brand-presets/${encodeURIComponent(presetId)}`,
        { method: 'PUT', body: payload },
      )
      await load()
      return true
    } catch (e: unknown) {
      error.value = extractFetchMessage(e, 'Failed to rename the brand preset')
      return false
    } finally {
      mutating.value = false
    }
  }

  /**
   * Returns true when the delete landed; the message is in `error` otherwise
   * — including the 409 for the site's last remaining preset.
   */
  async function deletePreset(presetId: string): Promise<boolean> {
    const base = siteStore.apiBase
    if (!base) return false
    mutating.value = true
    error.value = null
    try {
      await adminFetch<BrandPresetDeleteResponse>(
        `${base}/brand-presets/${encodeURIComponent(presetId)}`,
        { method: 'DELETE' },
      )
      const wasActive = activePresetId.value === presetId
      if (wasActive) activePresetId.value = null
      // `load()` re-defaults `activePresetId` to the new first preset when it
      // was just cleared above, or leaves it `null` if none are left.
      await load()
      return true
    } catch (e: unknown) {
      error.value = extractFetchMessage(e, 'Failed to delete the brand preset')
      return false
    } finally {
      mutating.value = false
    }
  }

  return {
    presets,
    activePresetId,
    loading,
    mutating,
    error,
    load,
    select,
    reset,
    createPreset,
    renamePreset,
    deletePreset,
  }
})
