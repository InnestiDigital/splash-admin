import { defineStore, storeToRefs } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useSiteStore } from '~/admin/stores/siteStore'
import { useBrandFormatStore } from '~/admin/stores/brandFormatStore'
import { adminFetch } from '~/admin/utils/adminFetch'
import { extractFetchMessage } from '~/admin/utils/fetchError'
import { useGenerationHistory } from '~/admin/composables/useGenerationHistory'
import { isRecord } from '~/shared/types/guards'
import { BRAND_TEMPLATE_NAME_MAX_LENGTH, narrowBrandTemplateRow } from '~/shared/types/brandTemplate'
import {
  BRAND_CANVAS_MIN_SIZE,
  BRAND_CANVAS_MAX_SIZE,
  isBrandCanvasDimension,
} from '~/shared/types/brandCanvas'
import { isCanvasPresetOption } from '~/shared/features/layout/canvasPresets'
import { isCanvasSnapshotRevision } from '~/shared/features/brand-studio/canvasSnapshotRevision'
import type { CanvasPresetOption } from '~/shared/features/layout/canvasPresets'
import type {
  BrandTemplateCreateRequest,
  BrandTemplateCuration,
  BrandTemplateRecord,
  BrandTemplateStatus,
  BrandTemplateUpdateRequest,
} from '~/shared/types/brandTemplate'
import type {
  BrandFormatSavedAsset,
  BrandRenderScale,
  BrandTemplateGenerationRecord,
} from '~/shared/types/brandRender'

/**
 * Brand Content Studio — the CANVAS registry's admin store.
 *
 * A template is a `brand-canvas` PAGE plus a registry row. This store owns the
 * row only: create (which mints the page server-side), rename, approve, delete,
 * and the render history of the approved snapshot. It deliberately owns no
 * content actions at all — blocks and sections are edited in the ordinary page
 * editor, through `editorStore`, which is why the row can go stale relative to
 * its page and why `version` exists to say so.
 *
 * Two things it must not grow back:
 *
 *  1. **No content writes.** There is no markup, no slots and no authoring
 *     chat here (the endpoints behind those answer 410). A write that changes
 *     what renders would bypass the editor's own history and the approval gate.
 *  2. **No override state.** Per-generation setting values belong to the
 *     Create-assets tier, which generates FROM an approved template. This
 *     page's `saveRender` renders the approved snapshot as approved.
 */

/** How a saved render reads against the template as it stands NOW. */
export type BrandTemplateGenerationState = 'current' | 'stale' | 'orphaned'

/** A history row plus the one thing the wire cannot state: how it reads today. */
export interface BrandTemplateGenerationCard {
  record: BrandTemplateGenerationRecord
  state: BrandTemplateGenerationState
  /** The version to compare the pin against; `null` once the template is gone. */
  currentVersion: number | null
}

/**
 * What `narrowTemplate` made of one row: the record, plus whether its approved
 * snapshot had to be dropped on the way in.
 */
interface NarrowedTemplate {
  record: BrandTemplateRecord
  /** True when a non-null `snapshot` failed the shared guard and was read as null. */
  snapshotDropped: boolean
}

/**
 * Narrowed at ingress with the SHARED parser (`narrowBrandTemplateRow`, also
 * used by `brandFormatStore`'s Create-assets list), because every field below
 * drives an irreversible control (approve, delete, open the canvas page).
 *
 * A snapshot that fails the shared canvas-snapshot guard is read as `null`
 * rather than dropping the whole row: an unparseable snapshot is exactly
 * "nothing this build can generate from", and hiding the template would leave
 * an admin unable to rename, re-approve or delete the very row that is broken.
 * The drop is reported as a warning here, never swallowed.
 */
function narrowTemplate(value: unknown): NarrowedTemplate | null {
  const record = narrowBrandTemplateRow(value)
  if (!record) return null
  // `record.snapshot` is only ever `null` because the wire value was actually
  // `null` (a never-approved template — not a malformed body) OR because it
  // failed the shared guard. Only the latter is worth a warning.
  const snapshotDropped = isRecord(value) && value.snapshot !== null && record.snapshot === null
  return { record, snapshotDropped }
}

/**
 * A history row, narrowed at ingress. The gallery is template-scoped, so a row
 * without the template discriminant is dropped rather than painted: a format
 * recipe carries no `templateVersion` and there is nothing honest to say about
 * its pin here.
 */
function isTemplateGenerationRow(value: unknown): value is BrandTemplateGenerationRecord {
  return isRecord(value)
    && value.kind === 'template'
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.templateId === 'string' && value.templateId.length > 0
    && typeof value.templateVersion === 'number'
    && typeof value.createdAt === 'string'
}

export const useBrandTemplateStore = defineStore('brandTemplates', () => {
  const siteStore = useSiteStore()
  const formatStore = useBrandFormatStore()
  const siteId = computed(() => siteStore.activeSiteId)

  const templates = ref<BrandTemplateRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** Non-fatal degradations from any leg — surfaced, never swallowed. */
  const warnings = ref<string[]>([])

  /**
   * The art directions this site's theme offers a NEW canvas. Empty = the
   * theme declares none, which is what makes the New-canvas form's radio
   * group disappear and creation behave exactly as it did before presets
   * existed — no separate "presets unsupported" branch to keep in sync.
   */
  const presets = ref<CanvasPresetOption[]>([])

  // Store instances outlive page instances. Site switches can therefore leave
  // requests for the previous tenant in flight; tokens plus the captured API
  // base ensure only the newest request for the still-active site may write.
  let templatesScopeBase: string | null = null
  let presetsScopeBase: string | null = null
  let loadRequest = 0
  let presetsRequest = 0

  const selectedId = ref<string | null>(null)
  const selected = computed(
    () => templates.value.find(template => template.id === selectedId.value) ?? null,
  )

  // Every mutation gets its own channel: a failed rename must not read as a
  // failed approval, and all four controls sit in the same panel.
  const creating = ref(false)
  const createError = ref<string | null>(null)

  const renaming = ref(false)
  const renameError = ref<string | null>(null)

  const statusSaving = ref(false)
  const statusError = ref<string | null>(null)

  const deleting = ref(false)
  const deleteError = ref<string | null>(null)

  const curationSaving = ref(false)
  const curationError = ref<string | null>(null)

  // ── The gallery: past renders of the selected template ─────────────────────
  /**
   * The fetch, supersede token and "already loaded" cache live in
   * `useGenerationHistory`; this store keeps its own row narrower
   * (`isTemplateGenerationRow` — the `kind` discriminant differs from the
   * format store's).
   */
  const generationHistory = useGenerationHistory<BrandTemplateGenerationRecord>({
    narrowRow: isTemplateGenerationRow,
    noSiteMessage: 'No site is selected, so there is no render history to list.',
    failureMessage: 'Failed to load past renders of this canvas',
  })
  const generations = generationHistory.rows
  const generationsLoading = generationHistory.loading
  const generationsError = generationHistory.error

  /**
   * `savingRender` / `saveRenderError` / `savedAsset` are no longer this
   * store's own state — they alias `brandFormatStore`'s, the single save path
   * every render (format or template) now runs through. See `saveRender`.
   */
  const { saving: savingRender, saveError: saveRenderError, savedAsset } = storeToRefs(formatStore)

  /**
   * The history rows with their pin resolved against the template as it stands.
   *
   * The comparison prefers the LOADED row's version over the
   * `currentTemplateVersion` the wire snapshotted: approving bumps the version
   * in this session, and a card that kept reading "current" after that would be
   * telling the admin that re-rendering gives them the picture they see. It
   * does not.
   */
  const generationCards = computed<BrandTemplateGenerationCard[]>(() =>
    generations.value.map((record) => {
      const live = selected.value?.id === record.templateId ? selected.value.version : null
      const currentVersion = live ?? record.currentTemplateVersion
      const state: BrandTemplateGenerationState = currentVersion === null
        ? 'orphaned'
        : currentVersion === record.templateVersion ? 'current' : 'stale'
      return { record, state, currentVersion }
    }),
  )

  /**
   * Only an approved template can be rendered through the gate — the save
   * endpoint answers a draft with a 404, and the reason is the approval, not a
   * missing row.
   */
  const canSaveRender = computed(() => selected.value?.status === 'approved')

  function pushWarnings(incoming: readonly unknown[]): void {
    for (const warning of incoming) {
      if (typeof warning === 'string' && !warnings.value.includes(warning)) warnings.value.push(warning)
    }
  }

  /** Everything scoped to ONE template. A different template is a different scope. */
  function resetTemplateScope(): void {
    renameError.value = null
    statusError.value = null
    deleteError.value = null
    curationError.value = null
    // The gallery is template-scoped: leaving one behind under another
    // template's heading would attribute renders to the wrong canvas.
    generationHistory.reset()
    // `saveRenderError` / `savedAsset` are shared with `brandFormatStore` now —
    // clearing them here is the same "new canvas, old receipt is stale" intent
    // the format store's own `resetSaveReceipt` expresses for its own callers.
    saveRenderError.value = null
    savedAsset.value = null
  }

  function enterTemplatesScope(base: string | null): void {
    if (templatesScopeBase === base) return
    templatesScopeBase = base
    templates.value = []
    selectedId.value = null
    resetTemplateScope()
  }

  function enterPresetsScope(base: string | null): void {
    if (presetsScopeBase === base) return
    presetsScopeBase = base
    presets.value = []
  }

  watch(
    () => siteStore.apiBase,
    (base) => {
      // Invalidate immediately rather than waiting for the destination page's
      // mounted load. That prevents even a brief old-tenant list or spinner
      // from surviving a same-component site route update.
      loadRequest += 1
      presetsRequest += 1
      enterTemplatesScope(base)
      enterPresetsScope(base)
      loading.value = false
      error.value = null
      warnings.value = []
    },
    { flush: 'sync' },
  )

  /** Narrows a list of rows, reporting what had to be dropped or degraded. */
  function ingestRows(rows: unknown[]): BrandTemplateRecord[] {
    const narrowed = rows.map(narrowTemplate)
    const kept = narrowed.filter((entry): entry is NarrowedTemplate => entry !== null)

    if (kept.length !== rows.length) {
      pushWarnings([`${rows.length - kept.length} canvas(es) came back in a shape this build does not understand and were hidden.`])
    }
    for (const entry of kept.filter(candidate => candidate.snapshotDropped)) {
      pushWarnings([`The approved snapshot of "${entry.record.name}" is in a shape this build cannot render — approve it again to replace it.`])
    }

    return kept.map(entry => entry.record)
  }

  async function load(): Promise<void> {
    const base = siteStore.apiBase
    const request = ++loadRequest
    enterTemplatesScope(base)
    if (!base) {
      loading.value = false
      error.value = null
      warnings.value = []
      return
    }

    const isCurrentRequest = (): boolean => request === loadRequest && siteStore.apiBase === base

    loading.value = true
    error.value = null
    warnings.value = []

    try {
      const response = await adminFetch<unknown>(`${base}/brand-templates`)
      if (!isCurrentRequest()) return
      const rows = Array.isArray(response) ? response : []
      templates.value = ingestRows(rows)
      if (selectedId.value && !templates.value.some(template => template.id === selectedId.value)) {
        selectedId.value = null
        resetTemplateScope()
      }
    } catch (e: unknown) {
      if (!isCurrentRequest()) return
      error.value = extractFetchMessage(e, 'Failed to load the brand canvases')
      templates.value = []
    } finally {
      if (request === loadRequest) loading.value = false
    }
  }

  function select(templateId: string | null): void {
    if (selectedId.value === templateId) return
    selectedId.value = templateId
    resetTemplateScope()
  }

  /**
   * The New-canvas form's art-direction radio list. Its own lazy action
   * (mirrors `loadGenerations`) rather than folded into `load()`: the panel
   * must open even when this call fails, and a failure here degrades to
   * "no radio, ordinary create" rather than blocking the canvas list.
   */
  async function fetchPresets(): Promise<void> {
    const base = siteStore.apiBase
    const request = ++presetsRequest
    enterPresetsScope(base)
    if (!base) {
      presets.value = []
      return
    }
    const isCurrentRequest = (): boolean => request === presetsRequest && siteStore.apiBase === base
    try {
      const response = await adminFetch<unknown>(`${base}/brand-canvas-presets`)
      if (!isCurrentRequest()) return
      const rows = isRecord(response) && Array.isArray(response.presets) ? response.presets : []
      const narrowed = rows.filter(isCanvasPresetOption)
      if (narrowed.length !== rows.length) {
        pushWarnings([`${rows.length - narrowed.length} art direction(s) came back in a shape this build does not understand and were hidden.`])
      }
      presets.value = narrowed
    } catch (e: unknown) {
      if (!isCurrentRequest()) return
      // Non-fatal: the New-canvas form still works without a radio, exactly
      // as it did before presets existed.
      presets.value = []
      pushWarnings([extractFetchMessage(e, 'Failed to load this site\'s canvas art directions')])
    }
  }

  /**
   * Create a canvas: the endpoint mints the `brand-canvas` page and the row
   * together, so the body carries only what neither can supply.
   *
   * `layoutId` names an art direction from `presets` — absent lets the
   * server resolve its own default (or `'blank'` when the theme declares
   * none), same as before presets existed.
   *
   * The new row is selected, because the next thing anyone does with a canvas
   * is open it in the editor.
   */
  async function create(
    name: string,
    width: number,
    height: number,
    layoutId?: string,
  ): Promise<BrandTemplateRecord | null> {
    const base = siteStore.apiBase
    if (!base) {
      createError.value = 'No site is selected, so there is nowhere to create a canvas.'
      return null
    }
    const trimmed = name.trim()
    if (trimmed.length === 0 || trimmed.length > BRAND_TEMPLATE_NAME_MAX_LENGTH) {
      createError.value = `A canvas name must be 1-${BRAND_TEMPLATE_NAME_MAX_LENGTH} characters.`
      return null
    }
    // Checked here as well as server-side so an out-of-range canvas is refused
    // before it costs a round trip — the endpoint stays the authority.
    if (!isBrandCanvasDimension(width) || !isBrandCanvasDimension(height)) {
      createError.value = `Width and height must be whole numbers between ${BRAND_CANVAS_MIN_SIZE} and ${BRAND_CANVAS_MAX_SIZE}.`
      return null
    }

    creating.value = true
    createError.value = null

    const body: BrandTemplateCreateRequest = { name: trimmed, width, height, ...(layoutId ? { layoutId } : {}) }
    try {
      const response = await adminFetch<unknown>(`${base}/brand-templates`, { method: 'POST', body })
      const narrowed = narrowTemplate(response)
      if (!narrowed) {
        createError.value = 'The create endpoint returned a canvas this build does not understand.'
        return null
      }
      templates.value = [narrowed.record, ...templates.value]
      select(narrowed.record.id)
      return narrowed.record
    } catch (e: unknown) {
      createError.value = extractFetchMessage(e, 'Failed to create this canvas')
      return null
    } finally {
      creating.value = false
    }
  }

  /**
   * Rename the selected canvas. A rename is only a rename: it never bumps the
   * version and never touches the approved snapshot, because the name is not
   * part of what renders.
   */
  async function rename(name: string): Promise<boolean> {
    const base = siteStore.apiBase
    const template = selected.value
    if (!base || !template) {
      renameError.value = 'Open a canvas first — there is nothing to rename.'
      return false
    }
    const trimmed = name.trim()
    if (trimmed.length === 0 || trimmed.length > BRAND_TEMPLATE_NAME_MAX_LENGTH) {
      renameError.value = `A canvas name must be 1-${BRAND_TEMPLATE_NAME_MAX_LENGTH} characters.`
      return false
    }
    // Not an error, and not a write either: the row already says this.
    if (trimmed === template.name) return true

    renaming.value = true
    renameError.value = null

    const update: BrandTemplateUpdateRequest = { name: trimmed }
    try {
      const response = await adminFetch<unknown>(
        `${base}/brand-templates/${template.id}`,
        { method: 'PUT', body: update },
      )
      return absorb(response, message => { renameError.value = message })
    } catch (e: unknown) {
      renameError.value = extractFetchMessage(e, 'Failed to rename this canvas')
      return false
    } finally {
      renaming.value = false
    }
  }

  /**
   * Move the selected canvas between `draft` and `approved`.
   *
   * `approved` is not a label: the server serializes the canvas page's draft
   * tree into the row's snapshot and bumps `version` in the same write. That is
   * why the panel's confirm names the version this call will produce, and why
   * editing the page afterwards does not silently revoke anything — the
   * approval keeps describing the tree it was made from.
   */
  async function setStatus(next: BrandTemplateStatus, expectedDraftRevision?: string): Promise<boolean> {
    const base = siteStore.apiBase
    const template = selected.value
    if (!base || !template) {
      statusError.value = 'Open a canvas first — there is nothing to approve.'
      return false
    }
    // Re-approving is a deliberate act (it re-snapshots a page that has moved),
    // so only the back-to-draft direction can be a no-op.
    if (next === 'draft' && template.status === 'draft') return true
    if (next === 'approved' && !isCanvasSnapshotRevision(expectedDraftRevision)) {
      statusError.value = 'Wait for the exact draft preview to finish before approving this canvas.'
      return false
    }

    statusSaving.value = true
    statusError.value = null

    const update: BrandTemplateUpdateRequest = next === 'approved'
      ? { status: next, expectedDraftRevision }
      : { status: next }
    try {
      const response = await adminFetch<unknown>(
        `${base}/brand-templates/${template.id}`,
        { method: 'PUT', body: update },
      )
      return absorb(response, message => { statusError.value = message })
    } catch (e: unknown) {
      statusError.value = extractFetchMessage(
        e,
        next === 'approved' ? 'Failed to approve this canvas' : 'Failed to send this canvas back to draft',
      )
      return false
    } finally {
      statusSaving.value = false
    }
  }

  /**
   * Set which of the selected canvas's block settings a `client` session may
   * change — the CURATION allow-list.
   *
   * Its own channel beside `rename` / `setStatus`, for the same reason those
   * two have theirs: all of them live in one panel, and a failed curation save
   * must not read as a failed approval.
   *
   * Curation is not part of the approval. It changes who may change what, never
   * a pixel, so this write does not bump `version` and no saved recipe goes
   * stale over it. `null` clears the list back to the closed default: nothing
   * is customer-editable and a client generates the approved content unchanged.
   */
  async function setCuration(next: BrandTemplateCuration | null): Promise<boolean> {
    const base = siteStore.apiBase
    const template = selected.value
    if (!base || !template) {
      curationError.value = 'Open a canvas first — there is nothing to curate.'
      return false
    }

    curationSaving.value = true
    curationError.value = null

    const update: BrandTemplateUpdateRequest = { customerSettings: next }
    try {
      const response = await adminFetch<unknown>(
        `${base}/brand-templates/${template.id}`,
        { method: 'PUT', body: update },
      )
      return absorb(response, message => { curationError.value = message })
    } catch (e: unknown) {
      curationError.value = extractFetchMessage(e, 'Failed to save the customer fields for this canvas')
      return false
    } finally {
      curationSaving.value = false
    }
  }

  /**
   * Shared tail of every write that answers with the row: narrow it, replace
   * the list entry, and report a shape this build cannot read rather than
   * leaving a stale row on screen as if the write had not happened.
   */
  function absorb(response: unknown, reportError: (message: string) => void): boolean {
    const narrowed = narrowTemplate(response)
    if (!narrowed) {
      reportError('The write went through, but the canvas came back in a shape this build does not understand. Reload before editing again.')
      return false
    }
    if (narrowed.snapshotDropped) {
      pushWarnings([`The approved snapshot of "${narrowed.record.name}" is in a shape this build cannot render — approve it again to replace it.`])
    }
    templates.value = templates.value.map(row => (row.id === narrowed.record.id ? narrowed.record : row))
    return true
  }

  /**
   * Delete a canvas: the row and its `brand-canvas` page, in one call.
   *
   * Assets already generated from it are untouched — a PNG is an ordinary media
   * row, and the recipes that made it keep their pinned version and outlive the
   * template on purpose.
   */
  async function remove(templateId: string): Promise<boolean> {
    const base = siteStore.apiBase
    if (!base) {
      deleteError.value = 'No site is selected, so there is nothing to delete.'
      return false
    }

    deleting.value = true
    deleteError.value = null

    try {
      await adminFetch<unknown>(`${base}/brand-templates/${templateId}`, { method: 'DELETE' })
      templates.value = templates.value.filter(row => row.id !== templateId)
      if (selectedId.value === templateId) {
        selectedId.value = null
        resetTemplateScope()
      }
      return true
    } catch (e: unknown) {
      deleteError.value = extractFetchMessage(e, 'Failed to delete this canvas')
      return false
    } finally {
      deleting.value = false
    }
  }

  /**
   * Load this site's saved renders of one template, newest first.
   *
   * Its own lazy action rather than part of `load()`: the panel must open even
   * when the history endpoint is down, and a gallery is only meaningful once a
   * template is selected. `force` is how a fresh save refreshes the strip.
   *
   * The fetch, the supersede token and the "already loaded" cache live in
   * `useGenerationHistory` — a template switch supersedes any load still in
   * flight there, and the previous template's rows are cleared up front, for
   * the same reasons this store used to implement locally.
   */
  async function loadGenerations(templateId: string, force = false): Promise<void> {
    if (!templateId) return
    await generationHistory.load({ templateId }, { force })
  }

  /**
   * Render the SELECTED canvas server-side and keep the PNG as a media asset.
   *
   * Delegates to `brandFormatStore.saveTemplateToLibrary` — the ONE path
   * everything that posts to `.../brand-formats/save` now runs through — with
   * an empty override map, since this page renders the approved snapshot AS
   * approved (per-block overrides belong to the Create-assets tier). That
   * delegation is also the fix for a real bug: this store's own request used
   * to omit the active preset entirely, so the same canvas saved from the
   * Templates page and from Create-assets landed in different preset scopes.
   * `saveTemplateToLibrary` always threads `presetId` from the shared preset
   * store, so both pages now save into the same scope.
   */
  async function saveRender(scale: BrandRenderScale = 1): Promise<BrandFormatSavedAsset | null> {
    const template = selected.value
    if (!siteStore.apiBase || !template) {
      saveRenderError.value = 'Open a canvas first — there is nothing to render.'
      return null
    }
    if (template.status !== 'approved') {
      saveRenderError.value = 'Only an approved canvas can be rendered. Approve this version first.'
      return null
    }

    // `postSave` pushes onto `formatStore.warnings`, not this store's own —
    // capture what this call added and mirror it here, so a render warning
    // still surfaces on the canvas page's own channel.
    const warningsBefore = formatStore.warnings.length
    const media = await formatStore.saveTemplateToLibrary(template.id, {}, scale)
    if (media) {
      pushWarnings(formatStore.warnings.slice(warningsBefore))
      // The save just wrote a history row; force past the "already loaded" guard.
      await loadGenerations(template.id, true)
    }
    return media
  }

  return {
    siteId,
    templates,
    loading,
    error,
    warnings,
    presets,
    selectedId,
    selected,
    creating,
    createError,
    renaming,
    renameError,
    statusSaving,
    statusError,
    deleting,
    deleteError,
    curationSaving,
    curationError,
    generations,
    generationCards,
    generationsLoading,
    generationsError,
    savingRender,
    saveRenderError,
    savedAsset,
    canSaveRender,
    load,
    fetchPresets,
    select,
    create,
    rename,
    setStatus,
    setCuration,
    remove,
    loadGenerations,
    saveRender,
  }
})
