import { defineStore, storeToRefs } from 'pinia'
import { ref, computed } from 'vue'
import { useSiteStore } from '~/admin/stores/siteStore'
import { useBrandPresetStore } from '~/admin/stores/brandPresetStore'
import { adminFetch } from '~/admin/utils/adminFetch'
import { extractFetchMessage } from '~/admin/utils/fetchError'
import type {
  BrandFieldGroup,
  BrandFieldSchema,
  BrandIdentity,
  BrandIdentityGetResponse,
  BrandIdentityPutRequest,
  BrandIdentityPutResponse,
} from '~/shared/types/brand'
import type { SplashPrefill } from '~/admin/lib/protocol/types/splash-prefill'

/**
 * Brand Content Studio — slice 1 store.
 *
 * Standalone (no editorStore coupling): the brand contract is a site-level
 * config page, not part of the block editor session.
 *
 * Slice 12 adds preset authoring: the site's named brand presets, an
 * `activePresetId` that scopes every identity read/write. The preset list,
 * selection and CRUD live in `brandPresetStore` (the single source of truth
 * shared with `brandFormatStore`) — this store re-exposes them under the same
 * names so a preset created here is visible on the Create-assets page without
 * either page reloading.
 */
export const useBrandIdentityStore = defineStore('brandIdentity', () => {
  const siteStore = useSiteStore()
  const presetStore = useBrandPresetStore()
  const siteId = computed(() => siteStore.activeSiteId)

  const identity = ref<BrandIdentity | null>(null)
  const schema = ref<BrandFieldSchema[]>([])
  const groups = ref<BrandFieldGroup[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  /**
   * Assistant prefill seam (spec §4.3): the identity PAGE sets this after
   * bootstrap() resolves; BrandIdentityPanel (owner of local/dirty) consumes it
   * and clears it. Never persisted; never read by the store itself.
   */
  const pendingPrefill = ref<SplashPrefill | null>(null)

  // ── Slice 12: preset authoring — state lives in `brandPresetStore` ─────────
  const {
    presets,
    activePresetId,
    loading: presetsLoading,
    mutating: presetMutating,
    error: presetsError,
  } = storeToRefs(presetStore)
  /**
   * Monotonic token for the in-flight identity load. A preset switch fires a
   * new fetch while the previous one may still be open; only the newest reply
   * may write the form's source record.
   */
  let identityRequest = 0

  /**
   * Site the shared `presetStore` was last reset for. `bootstrap()` runs on
   * every page mount, not just an actual site switch (the page also calls it
   * from `onMounted`) — without this guard it would reset the preset store
   * on every navigation to this page, silently re-defaulting the active
   * preset that `brandFormatStore` (Create-assets) also reads from the same
   * singleton.
   */
  let resetForSiteId: string | null = null

  /**
   * `?presetId=` for the active preset; empty = the wire's own default-preset
   * behavior. Unlike `brandFormatStore.presetScope()` (where `null` is a
   * deliberate wire-level "site default"), this surface always shows the
   * whole list, so `presetStore.load()` already resolves `null` to the first
   * (= default) entry — this only formats the query string.
   */
  function presetQuery(): string {
    return activePresetId.value === null
      ? ''
      : `?presetId=${encodeURIComponent(activePresetId.value)}`
  }

  async function fetchIdentity(): Promise<void> {
    if (!siteStore.apiBase) return
    const token = ++identityRequest
    loading.value = true
    error.value = null
    try {
      const data = await adminFetch<BrandIdentityGetResponse>(
        `${siteStore.apiBase}/brand-identity${presetQuery()}`,
      )
      if (token !== identityRequest) return
      identity.value = data.identity
      schema.value = data.schema
      groups.value = data.groups
    } catch (e: unknown) {
      if (token !== identityRequest) return
      error.value = extractFetchMessage(e, 'Failed to load brand identity')
      // The failed load was for the CURRENT scope (site + preset); whatever is
      // in `identity` belongs to the previous one. Keeping it would let the
      // form render the old preset's record under the new selection — and a
      // Save would then overwrite the new preset with the old one's values.
      // Clearing makes the panel hide the form until a retry lands.
      identity.value = null
      schema.value = []
      groups.value = []
    } finally {
      if (token === identityRequest) loading.value = false
    }
  }

  /** Returns true when the save landed; the message is in `error` otherwise. */
  async function saveIdentity(next: BrandIdentity): Promise<boolean> {
    if (!siteStore.apiBase) return false
    saving.value = true
    error.value = null
    try {
      const payload: BrandIdentityPutRequest = { identity: next }
      const data = await adminFetch<BrandIdentityPutResponse>(
        `${siteStore.apiBase}/brand-identity${presetQuery()}`,
        { method: 'PUT', body: payload },
      )
      identity.value = data.identity
      return true
    } catch (e: unknown) {
      error.value = extractFetchMessage(e, 'Failed to save brand identity')
      return false
    } finally {
      saving.value = false
    }
  }

  /** Mount / site-switch entry: presets first, then the identity scoped to the default. */
  async function bootstrap(): Promise<void> {
    // A site switch invalidates the previous site's preset ids — never carry
    // one across, or the identity fetch would scope to a foreign preset. But
    // this runs on every mount of this page, not only on an actual site
    // change, and `presetStore` is now shared with `brandFormatStore` — reset
    // only when the site actually changed, or a same-site revisit would clear
    // the active preset another consumer (Create-assets) has selected.
    if (siteId.value !== resetForSiteId) {
      presetStore.reset()
      resetForSiteId = siteId.value
    }
    // The identity record is cleared unconditionally: if the load below
    // fails, the previous scope's record must not be sitting there to be saved.
    identity.value = null
    schema.value = []
    groups.value = []
    error.value = null
    await presetStore.load()
    // Nothing to read until a preset exists: a site with no presets has no
    // identity record either, and the panel asks for a name before it edits
    // anything. Skipping the call keeps the empty state from fetching a
    // theme-derived record that belongs to no preset.
    if (presets.value.length > 0) await fetchIdentity()
  }

  /** Switches the preset the form edits and reloads the identity scoped to it. */
  async function selectPreset(presetId: string): Promise<void> {
    if (activePresetId.value === presetId) return
    presetStore.select(presetId)
    await fetchIdentity()
  }

  /** Returns true when the create landed; the message is in `presetsError` otherwise. */
  async function createPreset(name: string, cloneFrom?: string): Promise<boolean> {
    const landed = await presetStore.createPreset(name, cloneFrom)
    if (!landed) return false
    // The store already selected the new preset — read the identity it scopes to.
    await fetchIdentity()
    return true
  }

  /** Returns true when the rename landed; the message is in `presetsError` otherwise. */
  async function renamePreset(presetId: string, name: string): Promise<boolean> {
    return presetStore.renamePreset(presetId, name)
  }

  /**
   * Returns true when the delete landed; the message is in `presetsError`
   * otherwise — including the 409 for the site's last remaining preset.
   */
  async function deletePreset(presetId: string): Promise<boolean> {
    const wasActive = activePresetId.value === presetId
    const landed = await presetStore.deletePreset(presetId)
    if (!landed) return false
    // The store already re-defaulted the selection when it was the active one.
    if (wasActive) await fetchIdentity()
    return true
  }

  return {
    siteId,
    identity,
    schema,
    groups,
    loading,
    saving,
    error,
    pendingPrefill,
    presets,
    activePresetId,
    presetsLoading,
    presetMutating,
    presetsError,
    fetchIdentity,
    saveIdentity,
    bootstrap,
    selectPreset,
    createPreset,
    renamePreset,
    deletePreset,
  }
})
