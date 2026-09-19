import { defineStore, storeToRefs } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useSiteStore } from '~/admin/stores/siteStore'
import { useBrandPresetStore } from '~/admin/stores/brandPresetStore'
import { adminFetch } from '~/admin/utils/adminFetch'
import { extractFetchMessage } from '~/admin/utils/fetchError'
import { isRecord } from '~/shared/types/guards'
import type {
  BrandFormatSavedAsset,
  BrandRenderScale,
  BrandSaveResponse,
  BrandTemplateGenerateRequest,
} from '~/shared/types/brandRender'
import type { BrandCanvasOverrides } from '~/shared/types/brandCanvas'
import { narrowBrandTemplateRow } from '~/shared/types/brandTemplate'
import type { BrandTemplateRecord } from '~/shared/types/brandTemplate'

/**
 * ─── Why this file is still called `brandFormatStore` ────────────────────────
 *
 * HISTORICAL NAME, kept on purpose. The compiled-format tier it was written for
 * (a `*.format.json` descriptor painted by a compiled `.vue`, its catalog, its
 * composer and its campaign runner) is retired: an approved CANVAS — an
 * ordinary block tree snapshotted onto a `brand_format_templates` row — is the
 * only thing this studio generates from now.
 *
 * The HTTP routes kept their names too (`.../brand-formats/save`,
 * `.../brand-formats/generations`), so renaming the store would leave the code
 * and the wire disagreeing for no gain. Renaming both is churn with a migration
 * attached; this comment is the cheaper fix.
 */

// ─── Wire payloads (named, per the repo's TS contract rules) ──────────────────

/** The one page row shape this store needs off `GET .../pages` — id + a label. */
interface BrandStudioPageRow {
  id: string
  slug: string
  /** Localized map in practice, but never required — a page must not vanish over its title. */
  title: unknown
}

/** A page reduced to what the assign picker renders. */
export interface BrandStudioPageOption {
  id: string
  slug: string
  label: string
}

/** `PUT /api/admin/s/:siteId/pages/:pageId` — the reply we actually read. */
interface PageUpdateResponse {
  page: { id: string; ogImageId?: string | null }
}

/** The OG assignment is a small state machine, not three loose booleans. */
export type BrandOgAssignStatus = 'idle' | 'assigning' | 'assigned' | 'error'

/**
 * The pages endpoint returns the full page shape; only the identity matters
 * here. Narrow at the boundary rather than trusting the wire — but narrow no
 * further than `id` + `slug`: a row that is addressable is assignable, and a
 * real page silently missing from the picker reads as "that page is gone".
 * (The home page's slug is legitimately empty, so length is not required.)
 */
function isPageRow(value: unknown): value is BrandStudioPageRow {
  return isRecord(value)
    && typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.slug === 'string'
}

/** Localized titles are per-locale; the picker shows the first one authored. */
function pageLabel(row: BrandStudioPageRow): string {
  const fallback = `/${row.slug}`
  if (!isRecord(row.title)) return fallback
  for (const value of Object.values(row.title)) {
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  return fallback
}

/** The reply must actually come back pointing at the asset — see `assignSavedAssetToPage`. */
function isPageUpdateResponse(value: unknown): value is PageUpdateResponse {
  if (!isRecord(value) || !isRecord(value.page)) return false
  const page = value.page
  if (typeof page.id !== 'string') return false
  return page.ogImageId === undefined || page.ogImageId === null || typeof page.ogImageId === 'string'
}

/**
 * Brand Content Studio — the CREATE-ASSETS store.
 *
 * It owns exactly what the Create-assets page needs and nothing that renders:
 *
 *  - the site's APPROVED canvas templates (the pickable set),
 *  - the one save path every generation posts through (`saveTemplateToLibrary`),
 *  - the visual Brand Identity preset sent with preview/generation and stamped onto a recipe,
 *  - the page list and the OG-image assignment that follows a save.
 *
 * What it deliberately does NOT own: anything about how a canvas looks. A
 * render resolves the site's LIVE theme server-side per generation
 * (`resolveBrandCanvasTheme`), and the preview iframe is that same route — so
 * there is no brand-token snapshot, no `@font-face` string and no format
 * catalog to keep in sync here. The store owns only the selected preset id;
 * preview/export resolve its visual identity server-side at their boundaries.
 */
export const useBrandFormatStore = defineStore('brandFormats', () => {
  const siteStore = useSiteStore()
  const siteId = computed(() => siteStore.activeSiteId)

  /** Non-fatal degradations (a row that could not be read, a render warning) — surfaced, not swallowed. */
  const warnings = ref<string[]>([])

  const saving = ref(false)
  const saveError = ref<string | null>(null)
  /** The library row produced by the last successful save — the success state the panel names. */
  const savedAsset = ref<BrandFormatSavedAsset | null>(null)

  // ── Assign a saved asset as a page's OG image ──────────────────────────────
  const pages = ref<BrandStudioPageOption[]>([])
  const pagesLoading = ref(false)
  const pagesError = ref<string | null>(null)
  const assignStatus = ref<BrandOgAssignStatus>('idle')
  const assignError = ref<string | null>(null)
  /** The page the last successful assignment landed on, for the inline receipt. */
  const assignedPage = ref<BrandStudioPageOption | null>(null)

  // ── The design-system selector — named brand presets ───────────────────────
  // State lives in `brandPresetStore`, shared with `brandIdentityStore` so a
  // preset authored on Brand settings shows up here without a reload.
  const presetStore = useBrandPresetStore()
  const {
    presets,
    activePresetId,
    error: presetsError,
  } = storeToRefs(presetStore)

  /**
   * The active preset, shaped to spread into a request body. `null` spreads to
   * nothing: an omitted `presetId` is the wire's own "site default preset".
   */
  function presetScope(): { presetId?: string } {
    return activePresetId.value === null ? {} : { presetId: activePresetId.value }
  }

  // ── The pickable set: APPROVED canvas templates ────────────────────────────
  /**
   * Only `approved` rows with a readable snapshot: approval is exactly the gate
   * that makes a template generatable (the save/render endpoints answer 404 for
   * a draft), so listing anything else would be offering canvases the buttons
   * refuse. A 'client' session gets the same set — the server forces the filter
   * for that role rather than trusting this one.
   */
  const templates = ref<BrandTemplateRecord[]>([])
  const templatesLoading = ref(false)
  /** A failed LIST, on its own channel — distinct from "this site has no approved canvases yet". */
  const templatesError = ref<string | null>(null)

  // Seed from the site that existed when this store instance was created. This
  // avoids treating manually hydrated same-site state as foreign on the first
  // action, while every later site change still crosses the scope boundary.
  let activeScopeBase: string | null = siteStore.apiBase
  let templatesRequest = 0
  let thumbsRequest = 0
  let saveRequest = 0
  let pagesRequest = 0
  let assignRequest = 0

  async function loadTemplates(): Promise<void> {
    const base = siteStore.apiBase
    enterSiteScope(base)
    if (!base) {
      templatesError.value = 'No site is selected, so there are no canvases to list.'
      return
    }

    const request = ++templatesRequest
    const isCurrentRequest = (): boolean => request === templatesRequest && siteStore.apiBase === base

    templatesLoading.value = true
    templatesError.value = null

    try {
      const response = await adminFetch<unknown>(`${base}/brand-templates?status=approved`)
      if (!isCurrentRequest()) return
      const rows = Array.isArray(response) ? response : []

      // Narrowed with the SHARED parser (also used by `brandTemplateStore`), not
      // a stricter local check: a row whose shape this build cannot read at all
      // (bad id, bad status, …) is dropped and counted; an APPROVED row whose
      // snapshot specifically failed to parse is kept as a record with
      // `snapshot: null` so it can be named below, rather than vanishing with no
      // trace the way it used to.
      const narrowed = rows.map(narrowBrandTemplateRow)
      const unreadable = narrowed.filter(record => record === null).length
      if (unreadable > 0) {
        pushWarning(`${unreadable} canvas${unreadable === 1 ? '' : 'es'} came back in a shape this build does not understand and were hidden from Create assets.`)
      }

      const offerable: BrandTemplateRecord[] = []
      for (const record of narrowed) {
        if (record === null) continue
        // Approval is exactly the gate that makes a template generatable — a
        // draft is expected here and not worth a warning.
        if (record.status !== 'approved') continue
        if (record.snapshot === null) {
          pushWarning(`"${record.name || record.id}" is approved but its snapshot is in a shape this build cannot render — it will not appear in Create assets until it is approved again.`)
          continue
        }
        offerable.push(record)
      }
      templates.value = offerable
      // Fire-and-forget: card thumbnails are cosmetic and must never delay or
      // fail the list itself.
      void loadTemplateThumbs(base)
    } catch (e: unknown) {
      if (!isCurrentRequest()) return
      // `brand-templates` is readable by every role, including 'client' (the
      // server forces the reply to approved + snapshot-present rows for that
      // role) — a failure here is a real fault, not policy, and it must not read
      // as "you have no canvases".
      templatesError.value = extractFetchMessage(e, 'Failed to load the approved canvases')
      templates.value = []
    } finally {
      if (request === templatesRequest) templatesLoading.value = false
    }
  }

  function pushWarning(message: string): void {
    if (!warnings.value.includes(message)) warnings.value.push(message)
  }

  /**
   * Newest saved render per template — the picker card's thumbnail. One
   * site-wide history request (newest first) instead of a fetch per card.
   * Strictly cosmetic: any failure or gap just leaves the card's aspect-ratio
   * ghost in place, so errors are logged for debugging, never surfaced.
   */
  const templateThumbs = ref<Record<string, string>>({})

  /**
   * Clear every tenant-owned channel as soon as a different site is addressed.
   * The page starts its independent loads in parallel, so doing this in the
   * store keeps old-site rows, receipts and caches out of the new-site frame
   * even before the first response lands.
   */
  function enterSiteScope(base: string | null): void {
    if (activeScopeBase === base) return
    activeScopeBase = base

    // Invalidate every old-site request. Its `finally` must not clear a newer
    // site's loading state, just as its successful body must not write data.
    templatesRequest += 1
    thumbsRequest += 1
    saveRequest += 1
    pagesRequest += 1
    assignRequest += 1

    warnings.value = []
    templates.value = []
    templatesLoading.value = false
    templatesError.value = null
    templateThumbs.value = {}
    saving.value = false
    saveError.value = null
    savedAsset.value = null
    pages.value = []
    pagesLoading.value = false
    pagesError.value = null
    resetAssignment()
    // Presets are shared with Brand settings, but are tenant-owned too.
    presetStore.reset()
  }

  watch(
    () => siteStore.apiBase,
    base => enterSiteScope(base),
    { flush: 'sync' },
  )

  async function loadTemplateThumbs(expectedBase?: string): Promise<void> {
    const base = expectedBase ?? siteStore.apiBase
    if (!base || siteStore.apiBase !== base) return
    enterSiteScope(base)
    const request = ++thumbsRequest
    const isCurrentRequest = (): boolean => request === thumbsRequest && siteStore.apiBase === base
    try {
      const response = await adminFetch<unknown>(`${base}/brand-formats/generations`)
      if (!isCurrentRequest()) return
      const rows = isRecord(response) && Array.isArray(response.generations) ? response.generations : []
      const thumbs: Record<string, string> = {}
      for (const row of rows) {
        if (!isRecord(row) || row.kind !== 'template') continue
        if (typeof row.templateId !== 'string' || typeof row.url !== 'string' || row.url.length === 0) continue
        // Rows arrive newest-first; keep the first URL seen per template.
        if (!(row.templateId in thumbs)) thumbs[row.templateId] = row.url
      }
      templateThumbs.value = thumbs
    } catch (e: unknown) {
      if (!isCurrentRequest()) return
      console.debug('[BrandStudio] thumbnail history unavailable, cards keep the placeholder:', e)
      templateThumbs.value = {}
    }
  }

  /**
   * Save a filled-in canvas render to the media library — the ONE path
   * everything that posts to `.../brand-formats/save` runs through (this
   * store's workspace, and `brandTemplateStore.saveRender` on the canvases
   * page, which delegates here rather than carrying its own copy).
   *
   * The server applies `overrides` over the APPROVED snapshot for this render
   * only and records them in the recipe; the canvas page is never written.
   *
   * Blocks whose override map ended up empty are dropped before the request:
   * they are what an author leaving a block untouched (or resetting it) looks
   * like, and sending them would record blocks in the recipe that changed
   * nothing. The server narrows the map again — this is a courtesy, not the
   * validation.
   */
  async function saveTemplateToLibrary(
    templateId: string,
    overrides: BrandCanvasOverrides,
    scale: BrandRenderScale = 1,
  ): Promise<BrandFormatSavedAsset | null> {
    const base = siteStore.apiBase
    enterSiteScope(base)
    if (!base) {
      saveError.value = 'No site is selected, so there is nowhere to save the asset.'
      return null
    }
    const requestToken = ++saveRequest
    const isCurrentRequest = (): boolean => requestToken === saveRequest && siteStore.apiBase === base

    const applied: BrandCanvasOverrides = {}
    for (const [blockId, settings] of Object.entries(overrides)) {
      if (Object.keys(settings).length > 0) applied[blockId] = settings
    }
    const request: BrandTemplateGenerateRequest = {
      templateId,
      scale,
      ...presetScope(),
      ...(Object.keys(applied).length > 0 ? { overrides: applied } : {}),
    }

    saving.value = true
    saveError.value = null
    savedAsset.value = null
    // A new render means the previous "assigned to /about" receipt is about a
    // different image. Retire it rather than let it describe the wrong asset.
    resetAssignment()

    try {
      const response = await adminFetch<BrandSaveResponse>(`${base}/brand-formats/save`, {
        method: 'POST',
        body: request,
      })
      if (!isCurrentRequest()) return null
      // Defensive against a missing field even though the type says required —
      // `brandTemplateStore.saveRender` runs through here too, and its own suite
      // covers a reply with no `warnings` key at all.
      for (const warning of response.warnings ?? []) pushWarning(warning)
      savedAsset.value = response.media
      // A fresh render is by definition the template's newest — update the
      // picker thumbnail without waiting for a full history reload.
      if (typeof response.media?.url === 'string' && response.media.url.length > 0) {
        templateThumbs.value = { ...templateThumbs.value, [templateId]: response.media.url }
      }
      return response.media
    } catch (e: unknown) {
      if (!isCurrentRequest()) return null
      saveError.value = extractFetchMessage(e, 'Failed to save the render to the media library')
      return null
    } finally {
      if (requestToken === saveRequest) saving.value = false
    }
  }

  /** Clears the save receipt. Replaces the `store.savedAsset = null` writes components still do directly. */
  function resetSaveReceipt(): void {
    savedAsset.value = null
    saveError.value = null
  }

  /**
   * List the site's presets, oldest (= default) first, for the design-system
   * selector. Delegates entirely to `brandPresetStore` — the single source of
   * truth for the list, shared with `brandIdentityStore`.
   */
  async function loadPresets(): Promise<void> {
    enterSiteScope(siteStore.apiBase)
    await presetStore.load()
  }

  /**
   * Switch the visual Brand Identity preset for preview/generation.
   *
   * It reloads nothing here: the canvas iframe URL and generation request are
   * reactive to this id, and the server resolves the matching logo/token layer
   * at their own boundaries.
   */
  function setActivePreset(presetId: string | null): void {
    presetStore.select(presetId)
  }

  /** Clears the assignment state machine back to its resting state. */
  function resetAssignment(): void {
    assignStatus.value = 'idle'
    assignError.value = null
    assignedPage.value = null
  }

  /**
   * Fetch the site's pages so a saved asset can be pointed at one of them.
   *
   * Lazy and idempotent: the studio is mostly used without ever assigning, so
   * this only runs when the author has something to assign. A failure is
   * reported on its own channel — it must not blank the studio.
   */
  async function loadPages(force = false): Promise<void> {
    const base = siteStore.apiBase
    enterSiteScope(base)
    if (!base) {
      pagesError.value = 'No site is selected, so there are no pages to list.'
      return
    }
    if (pagesLoading.value) return
    if (pages.value.length > 0 && !force) return

    const request = ++pagesRequest
    const isCurrentRequest = (): boolean => request === pagesRequest && siteStore.apiBase === base

    pagesLoading.value = true
    pagesError.value = null

    try {
      const response = await adminFetch<unknown>(`${base}/pages`)
      if (!isCurrentRequest()) return
      const rows = isRecord(response) && Array.isArray(response.pages) ? response.pages : []
      pages.value = rows
        .filter(isPageRow)
        .map(row => ({ id: row.id, slug: row.slug, label: pageLabel(row) }))
    } catch (e: unknown) {
      if (!isCurrentRequest()) return
      pagesError.value = extractFetchMessage(e, 'Failed to load the site pages')
      pages.value = []
    } finally {
      if (request === pagesRequest) pagesLoading.value = false
    }
  }

  /**
   * Point `pageId`'s OG image at the asset the last save produced.
   *
   * Reuses the ordinary page-update endpoint — the same write the SEO panel
   * performs — so there is exactly one path that sets `ogImageId`. A second
   * endpoint here would be a second thing to keep correct.
   */
  async function assignSavedAssetToPage(pageId: string): Promise<boolean> {
    const base = siteStore.apiBase
    enterSiteScope(base)
    const asset = savedAsset.value

    if (!base) {
      assignStatus.value = 'error'
      assignError.value = 'No site is selected, so there is nowhere to assign the asset.'
      return false
    }
    if (!asset) {
      assignStatus.value = 'error'
      assignError.value = 'Save a render to the media library first — there is no asset to assign yet.'
      return false
    }
    if (!pageId) {
      assignStatus.value = 'error'
      assignError.value = 'Pick a page to assign this image to.'
      return false
    }

    const request = ++assignRequest
    const isCurrentRequest = (): boolean => request === assignRequest && siteStore.apiBase === base

    assignStatus.value = 'assigning'
    assignError.value = null
    assignedPage.value = null

    try {
      const response = await adminFetch<unknown>(`${base}/pages/${pageId}`, {
        method: 'PUT',
        body: { ogImageId: asset.id },
      })
      if (!isCurrentRequest()) return false
      // A 200 is not a receipt. The endpoint replies with the page it wrote, so
      // read it: if the field did not land, saying "assigned" would be a lie the
      // author only discovers when the social card is still wrong.
      if (!isPageUpdateResponse(response) || response.page.ogImageId !== asset.id) {
        assignStatus.value = 'error'
        assignError.value = 'The page was saved but did not come back pointing at this image. Check the page SEO settings.'
        return false
      }
      assignedPage.value = pages.value.find(page => page.id === pageId)
        ?? { id: pageId, slug: '', label: 'the selected page' }
      assignStatus.value = 'assigned'
      return true
    } catch (e: unknown) {
      if (!isCurrentRequest()) return false
      assignStatus.value = 'error'
      assignError.value = extractFetchMessage(e, 'Failed to assign the image as the page OG image')
      return false
    }
  }

  return {
    siteId,
    warnings,
    templates,
    templatesLoading,
    templatesError,
    templateThumbs,
    loadTemplates,
    saveTemplateToLibrary,
    saving,
    saveError,
    savedAsset,
    resetSaveReceipt,
    pages,
    pagesLoading,
    pagesError,
    assignStatus,
    assignError,
    assignedPage,
    presets,
    presetsError,
    activePresetId,
    loadPresets,
    setActivePreset,
    loadPages,
    assignSavedAssetToPage,
    resetAssignment,
  }
})
