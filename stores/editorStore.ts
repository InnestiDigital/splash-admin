import { defineStore, storeToRefs } from 'pinia'
import { ref, computed } from 'vue'
import type { Block, Section } from '~/server/storage/types'
import type { BlockPlacementConfig } from '~/shared/types/placement'
import { splitThemeSettingsByCssVar } from '~/shared/utils/cssOverride'
import { transformRichtextFields as sharedTransformRichtextFields } from '~/shared/tiptap/transformRichtextFields'
import { mapPresetForSnapshot } from '~/server/services/typography/snapshotMapper'
import { useSiteStore } from '~/admin/stores/siteStore'
import { adminFetch } from '~/admin/utils/adminFetch'
import { previewBlockSettingsInState } from '~/admin/utils/blockState'
import { deepGet, deepSet } from '~/shared/utils/deepPath'

// Domain stores
import { useSelectionStore } from '~/admin/stores/selectionStore'
import { useFontStore } from '~/admin/stores/fontStore'
import { useTypographyStore } from '~/admin/stores/typographyStore'
import { useSchemaStore } from '~/admin/stores/schemaStore'
import { useThemeStore } from '~/admin/stores/themeStore'
import { useSceneStore } from '~/admin/stores/sceneStore'
import { useSectionStore } from '~/admin/stores/sectionStore'
import { useBlockStore } from '~/admin/stores/blockStore'
import { usePageStore } from '~/admin/stores/pageStore'
import { useClipboardStore } from '~/admin/stores/clipboardStore'
import {
  editorChangeKey,
  editorChangeScope,
  useEditorChangeStore,
} from '~/admin/stores/editorChangeStore'

// Re-export types consumed by 37 existing consumers — must stay stable.
export { splitThemeSettingsByCssVar } from '~/shared/utils/cssOverride'
export type { EditorMode } from '~/admin/stores/selectionStore'

// ── Private helpers (unchanged from original) ──────────────────────────────

function deepClone<T>(obj: T): T {
  if (obj === undefined || obj === null) return obj
  return JSON.parse(JSON.stringify(obj))
}

function deepMerge(target: any, source: any): any {
  const result = deepClone(target)
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

// ── Proxy / coordinator store ───────────────────────────────────────────────
//
// This store is the single entry point for all 37 consumer files.
// It instantiates nine focused domain stores and re-exports their state and
// actions under the original property names so consumers remain unchanged.
//
// Cross-store orchestrators (switchPage, createSectionFromPreset, …) and the
// preview config builder also live here because they read from multiple domains.
//
// Migration path: once consumers are updated to import domain stores directly,
// this proxy can be removed. Track in a follow-up ticket.

export const useEditorStore = defineStore('editor', () => {
  // ── Domain stores ──
  const siteStore = useSiteStore()
  const changeStore = useEditorChangeStore()
  const selectionStore = useSelectionStore()
  const fontStore = useFontStore()
  const typographyStore = useTypographyStore()
  const schemaStore = useSchemaStore()
  const themeStore = useThemeStore()
  const sceneStore = useSceneStore()
  const sectionStore = useSectionStore()
  const blockStore = useBlockStore()
  const pageStore = usePageStore()
  const clipboardStore = useClipboardStore()

  // ── Reactive state extracted from domain stores ──
  // storeToRefs preserves reactivity: writing store.blocks = [...] still updates
  // the underlying blockStore ref via Pinia's ObjectRef proxy.

  const {
    editorMode,
    selectedBlockId,
    showThemeSettings,
    showPageSettings,
    selectedLayoutType,
    showLayoutSettings,
  } = storeToRefs(selectionStore)

  const {
    fonts,
    fontsLoaded,
    fontsAvailable,
    fontsUsedBytes,
    fontsQuotaBytes,
    fontsMaxFileBytes,
    fontsUploading,
    fontsError,
  } = storeToRefs(fontStore)

  const {
    typographyPresets,
    typographyRoles,
  } = storeToRefs(typographyStore)

  const {
    schemas,
    themeManifest,
    layoutComponentTypes,
    locales,
    defaultLocale,
    editingLocale,
    layoutSchemas,
  } = storeToRefs(schemaStore)

  const {
    themeSettings,
    themeSettingsSchema,
    themeSettingsGroups,
    layoutSettings,
    layoutMeta,
  } = storeToRefs(themeStore)

  const {
    scenes,
    scenesLoaded,
    selectedSceneId,
    selectedEntryId,
  } = storeToRefs(sceneStore)

  const {
    sections,
    activeSectionId,
    activeSection,
    visibleSections,
  } = storeToRefs(sectionStore)

  const {
    blocks,
    blockPlacement,
    canUndoBlocks,
    canRedoBlocks,
  } = storeToRefs(blockStore)

  const {
    pages,
    currentPage,
    topLevelPages,
    dynamicSlugParams,
  } = storeToRefs(pageStore)

  // ── Proxy-owned state ──

  /** Derived from siteStore for provide/inject compatibility. */
  const siteId = computed(() => siteStore.activeSiteId)

  /** Baseline config fetched from `/preview-config`, cloned before merging drafts. */
  const initialConfig = ref<any>(null)
  /** Warnings surfaced by the preview-config endpoint (e.g. slug conflicts). */
  const previewWarnings = ref<string[]>([])

  /** Dynamic segment values set by the editor for preview (e.g. { id: 'iphone-15' }). */
  const previewRouteParams = ref<Record<string, string>>({})

  /** Non-null while the preview is showing a child-site mount page (no DB page). */
  const activeChildPageSlug = ref<string | null>(null)

  // ── Aggregated loading / saving / error ──
  //
  // Proxy-owned loads and immediate errors remain local. Every mutation is
  // represented by editorChangeStore as either a retryable save job or a
  // one-shot operation, so saving has one canonical source.

  const _ownLoading = ref(false)
  const _ownError = ref<string | null>(null)

  const loading = computed(() => _ownLoading.value)

  const saving = computed(() => changeStore.isSaving)

  const error = computed(() => (
    // Autosave failures are actionable in EditorSaveStatus and must not cover
    // the editor with the load-error overlay. Immediate CRUD/load failures
    // continue to use the dedicated blocking-error channel.
    changeStore.hasErrors
      ? null
      : (sceneStore.error ?? sectionStore.error ?? _ownError.value)
  ))

  /**
   * This store's OWN error, undecorated. `error` above is a UI aggregate: it
   * answers null while `changeStore.hasErrors`, and its scene/section
   * precedence lets another store's stale message shadow this one. A caller
   * that samples an error ref to decide whether a specific void action of THIS
   * store succeeded (the assistant's editor-op executor) needs the raw channel
   * the action actually writes — the aggregate would both hide real failures
   * and attribute foreign ones.
   */
  const ownError = computed(() => _ownError.value)

  // ── Cross-store computed properties ──

  const selectedBlock = computed(() => {
    if (!selectedBlockId.value) return null
    return blocks.value.find(b => b.id === selectedBlockId.value) ?? null
  })

  const selectedBlockSchema = computed(() => {
    if (!selectedBlock.value) return null
    return schemas.value[selectedBlock.value.type] ?? null
  })

  const selectedLayoutSchema = computed(() => {
    if (!selectedLayoutType.value) return null
    return layoutSchemas.value[selectedLayoutType.value]
  })

  // Section selection is a union variant now, so this is a direct read rather
  // than "a section id exists AND nothing else is selected" (I5).
  const showSectionSettings = computed(() => editorMode.value.type === 'section')

  /** The section the panel is showing, as opposed to the section in context. */
  const selectedSectionId = computed(() =>
    editorMode.value.type === 'section' ? editorMode.value.sectionId : null,
  )
  const selectedSection = computed(() =>
    sections.value.find(candidate => candidate.id === selectedSectionId.value) ?? null,
  )

  const sectionBlocks = computed(() => (sectionId: string) =>
    blocks.value.filter(b => b.sectionId === sectionId).sort((a, b) => a.position - b.position)
  )

  const orphanedBlocks = computed(() =>
    blocks.value.filter(b => !b.sectionId && sections.value.length > 0)
  )

  /**
   * Reconcile only fields owned by a shallow block PUT. Keeping this beside
   * the request avoids adding a cross-store action that can be missing from a
   * live Pinia instance during Vite hot reloads.
   */
  function reconcileBlockResponse(
    blockId: string,
    response: Block,
    request: Record<string, any>,
  ): void {
    const index = blocks.value.findIndex(block => block.id === blockId)
    if (index === -1) return
    const current = blocks.value[index]
    if (!current) return

    const nextSettings = { ...(current.settings || {}) }
    for (const key of Object.keys(request)) {
      if (key === 'layoutRole' || key === 'placement') continue
      nextSettings[key] = deepClone((response.settings as any)?.[key])
    }

    const reconciled: Block = {
      ...current,
      settings: nextSettings,
      ...('layoutRole' in request ? { layoutRole: response.layoutRole ?? null } : {}),
      ...('placement' in request ? { placement: response.placement } : {}),
    }
    const localPlacement = blockPlacement.value[blockId]
    blocks.value[index] = localPlacement
      ? { ...reconciled, placement: deepClone(localPlacement) }
      : reconciled
  }

  // Child site mount paths extracted from the merged preview config
  const childSitePages = computed<Array<{ mountPath: string; label: string }>>(() => {
    const config = initialConfig.value
    if (!config?.childSites) return []
    return Object.entries(config.childSites as Record<string, any>).map(([mountPath]) => ({
      mountPath,
      label: mountPath.charAt(0).toUpperCase() + mountPath.slice(1),
    }))
  })

  // ── Inspector selection safety ──

  function activeInspectorJobKeys(): string[] {
    if (editorMode.value.type === 'block') {
      const key = editorChangeKey.block(editorMode.value.blockId)
      return changeStore.getJob(key) ? [key] : []
    }
    if (editorMode.value.type === 'layout') {
      const key = editorChangeKey.layout(siteId.value || 'unknown', editorMode.value.layoutType)
      return changeStore.getJob(key) ? [key] : []
    }
    if (editorMode.value.type === 'theme-settings') {
      const key = editorChangeKey.theme(siteId.value || 'unknown')
      return changeStore.getJob(key) ? [key] : []
    }
    if (editorMode.value.type === 'page-settings' && currentPage.value) {
      const scope = editorChangeScope.page(currentPage.value.id)
      return changeStore.jobList
        .filter(job => job.surface === 'page' && job.scope === scope)
        .map(job => job.key)
    }
    if (editorMode.value.type === 'section' && currentPage.value) {
      const key = editorChangeKey.section(currentPage.value.id, editorMode.value.sectionId)
      return changeStore.getJob(key) ? [key] : []
    }
    return []
  }

  function activeInspectorScope(): string | null {
    if (editorMode.value.type === 'layout') {
      return editorChangeScope.site(siteId.value || 'unknown')
    }
    if (editorMode.value.type === 'theme-settings') {
      return editorChangeScope.site(siteId.value || 'unknown')
    }
    if (currentPage.value && (
      editorMode.value.type === 'block'
      || editorMode.value.type === 'page-settings'
      || editorMode.value.type === 'section'
    )) {
      return editorChangeScope.page(currentPage.value.id)
    }

    // Primarily keeps isolated store tests and transitional callers safe when
    // a keyed inspector job exists before page hydration has completed.
    const keyedJob = activeInspectorJobKeys()
      .map(key => changeStore.getJob(key))
      .find(job => job !== null)
    return keyedJob?.scope ?? null
  }

  function hasActiveInspectorWork(): boolean {
    const keys = new Set(activeInspectorJobKeys())
    if (changeStore.jobList.some(job => keys.has(job.key) && (job.dirty || job.saving))) {
      return true
    }

    const scope = activeInspectorScope()
    if (!scope) return false
    return changeStore.jobList.some(job => job.scope === scope && (job.dirty || job.saving))
      || changeStore.operationList.some(operation => operation.scope === scope)
  }

  async function flushActiveInspector(): Promise<boolean> {
    const scope = activeInspectorScope()
    if (scope) {
      const result = await changeStore.flushScope(scope, true)
      return result.ok
    }

    const keys = activeInspectorJobKeys()
    if (keys.length === 0) return true
    return (await changeStore.flushKeys(keys, true)).ok
  }

  /**
   * Keep the current inspector mounted until its work has saved. This is
   * especially important for validation-blocked jobs: switching first would
   * destroy the only UI capable of fixing the draft.
   */
  async function flushSiteScopedInspectorForPageHydration(): Promise<boolean> {
    if (editorMode.value.type !== 'layout') return true
    const result = await changeStore.flushScope(
      editorChangeScope.site(siteId.value || 'unknown'),
      true,
    )
    return result.ok
  }

  function changeInspector(next: () => void): Promise<boolean> {
    if (!hasActiveInspectorWork()) {
      // Keep the long-standing same-tick selection semantics when there is
      // nothing to persist; only real save work needs an async transition.
      next()
      return Promise.resolve(true)
    }
    return flushActiveInspector().then((saved) => {
      if (!saved) return false
      next()
      return true
    })
  }

  function selectBlock(blockId: string): Promise<boolean> {
    if (selectedBlockId.value === blockId) return Promise.resolve(true)
    return changeInspector(() => {
      const block = blocks.value.find(candidate => candidate.id === blockId)
      // Context, not selection: the owning section stays expanded and remains
      // the insertion target while the block is selected (I5).
      sectionStore.setActiveSection(block?.sectionId ?? null)
      selectionStore.selectBlock(blockId)
    })
  }

  function selectThemeSettings(): Promise<boolean> {
    if (selectionStore.showThemeSettings) return Promise.resolve(true)
    return changeInspector(() => {
      sectionStore.setActiveSection(null)
      selectionStore.selectThemeSettings()
    })
  }

  function selectPageSettings(): Promise<boolean> {
    if (selectionStore.showPageSettings) return Promise.resolve(true)
    return changeInspector(() => {
      sectionStore.setActiveSection(null)
      selectionStore.selectPageSettings()
    })
  }

  function selectLayoutComponent(type: string): Promise<boolean> {
    if (selectedLayoutType.value === type) return Promise.resolve(true)
    return changeInspector(() => {
      sectionStore.setActiveSection(null)
      selectionStore.selectLayoutComponent(type)
    })
  }

  function deselectAll(): Promise<boolean> {
    if (editorMode.value.type === 'none' && activeSectionId.value === null) {
      return Promise.resolve(true)
    }
    return changeInspector(() => {
      sectionStore.setActiveSection(null)
      selectionStore.deselectAll()
    })
  }

  // ── Preview config builder ──

  function transformRichtextForPreview(
    settings: Record<string, any>,
    blockType: string,
    presetKeys: Set<string>,
  ): Record<string, any> {
    const schema = schemas.value[blockType]
    // resolveSchema lets the shared transform recurse into `type: "blocks"`
    // children (e.g. GridBlock -> info-card) so their richtext fields convert
    // against their own schemas, mirroring the server's transformNestedBlock.
    const resolveSchema = (type: string) => schemas.value[type] ?? null
    return sharedTransformRichtextFields(settings, schema ?? null, presetKeys, resolveSchema)
  }

  /**
   * Build preview config by merging initial config with current draft changes.
   * Reads from six domain stores; lives in the coordinator to keep domain
   * stores decoupled from each other.
   */
  function buildPreviewConfig() {
    if (!initialConfig.value) return null

    const config = deepClone(initialConfig.value)

    const presetKeys = new Set(
      (typographyPresets.value ?? [])
        .filter((p: any) => p.isActive)
        .map((p: any) => p.key),
    )
    const pageSlug = currentPage.value?.slug || 'home'
    const ancestorSlugs = currentPage.value
      ? pageStore.getAncestorSlugs(currentPage.value)
      : []

    // Apply theme settings (split cssVar fields out into themeVars)
    if (themeSettings.value && Object.keys(themeSettings.value).length > 0) {
      const { plain, cssVars } = splitThemeSettingsByCssVar(
        themeSettings.value,
        themeSettingsSchema.value,
      )
      config.themeSettings = deepMerge(config.themeSettings || {}, plain)
      if (Object.keys(cssVars).length > 0) {
        config.themeVars = { ...(config.themeVars || {}), ...cssVars }
      }
    }

    // Resolve the container where this page's config lives — walk full ancestor chain
    let pageContainer: Record<string, any> = config.pages
    for (const slug of ancestorSlugs) {
      pageContainer[slug] = pageContainer[slug] ?? {}
      pageContainer[slug].pages = pageContainer[slug].pages ?? {}
      pageContainer = pageContainer[slug].pages
    }

    // Ensure page exists in config
    if (!pageContainer[pageSlug] && currentPage.value) {
      pageContainer[pageSlug] = {
        title: currentPage.value.title,
        layout: currentPage.value.layout || 'default',
        dynamic: currentPage.value.dynamic || false,
        pageType: currentPage.value.pageType ?? 'static',
        meta: currentPage.value.meta || {},
        blocks: [],
      }
    }

    // Always sync layout from current page state
    if (pageContainer[pageSlug] && currentPage.value) {
      pageContainer[pageSlug].layout = currentPage.value.layout || 'default'
      pageContainer[pageSlug].pageType = currentPage.value.pageType ?? 'static'
      if ('templateSettings' in currentPage.value) {
        pageContainer[pageSlug].templateSettings = deepClone(currentPage.value.templateSettings ?? {})
      }
    }

    // Update current page's blocks
    if (pageContainer[pageSlug]) {
      pageContainer[pageSlug].blocks = blocks.value.map(block => {
        const schemaFields = schemas.value[block.type]?.settings
        const { plain, cssVars } = splitThemeSettingsByCssVar(
          block.settings || {},
          schemaFields,
        )

        // Always run richtext conversion — even with no preset keys,
        // TipTap JSON must be converted to HTML for the preview renderer.
        const renderedSettings = transformRichtextForPreview(plain, block.type, presetKeys)

        const previewBlock: any = {
          type: block.type,
          settings: renderedSettings,
          options: block.options || {},
          events: block.events || [],
          _previewId: String(block.id),
          // Preserve block.id so downstream renderers can resolve stable identity
          // (DynamicPage resolvedBlockProps, AnimatedBlock block-id, SCATTER_ITEM_PATCH)
          id: String(block.id),
          ...(block.sectionId ? { sectionId: block.sectionId } : {}),
          ...(block.layoutRole ? { layoutRole: block.layoutRole } : {}),
          ...(block.position != null ? { position: block.position } : {}),
          ...(block.placement ? { placement: block.placement } : {}),
        }
        if (Object.keys(cssVars).length > 0) {
          previewBlock.cssOverride = cssVars
        }
        return previewBlock
      })
    }

    // Sync sections to preview config
    if (pageContainer[pageSlug] && sections.value.length > 0) {
      pageContainer[pageSlug].sections = sections.value.map(s => ({
        id: s.id,
        name: s.name,
        anchor: s.anchor,
        isHidden: s.isHidden,
        colorScheme: s.colorScheme,
        sectionRole: s.sectionRole,
        sectionType: s.sectionType,
        containerMode: s.containerMode,
        position: s.position,
        layoutConfig: s.layoutConfig,
        sectionSpaceY: (s as any).sectionSpaceY,
        containerInsetX: (s as any).containerInsetX,
        revealPreset: s.revealPreset,
        revealOverrides: s.revealOverrides,
        choreographyMeta: s.choreographyMeta,
        defaultBlockEntrance: s.defaultBlockEntrance,
      }))
    }

    // Apply layout settings (header/footer/static components)
    if (!config.navigation) {
      config.navigation = {}
    }

    for (const type of layoutComponentTypes.value) {
      const raw = layoutSettings.value[type]
      if (!raw || Object.keys(raw).length === 0) continue

      const merged = deepMerge(config.navigation[type] || {}, raw)
      const schemaFields = layoutSchemas.value[type]?.settings
      const { plain: cleanedNav, cssVars } = splitThemeSettingsByCssVar(merged, schemaFields, { keepOriginals: true })

      config.navigation[type] = cleanedNav
      if (Object.keys(cssVars).length > 0) {
        config.navigation[type].cssOverride = cssVars
      }
    }

    // Sync typography presets/roles so the preview iframe has current CSS.
    // Use the SAME shared mapper as publishService + preview-config endpoint.
    // Hand-rolling the projection here drops axis fields (variationAxes,
    // fontStyle, fontStretch, fontOpticalSizing, etc.) and silently makes
    // variable-font presets render with the wrong weight/optical-size in the
    // preview iframe — e.g. fraunces-display falls back to 400 instead of the
    // axes-derived 700.
    if (typographyPresets.value.length > 0) {
      config.typographyPresets = typographyPresets.value
        .filter((p: any) => p.isActive)
        .map(mapPresetForSnapshot)
    }
    if (Object.keys(typographyRoles.value).length > 0) {
      config.typographyRoles = typographyRoles.value
    }

    return config
  }

  const previewConfig = computed(() => {
    // Access reactive deps to ensure computed re-runs on any draft change.
    // typographyPresets/Roles MUST be tracked: they load asynchronously after
    // blocks, and buildPreviewConfig uses the active preset keys to gate
    // which `.rt-preset-*` classes survive the richtext transform. Without
    // tracking, the first run sees an empty preset set and strips every
    // preset class from TipTap paragraphs — preview renders plain <p> while
    // the live publish (which builds with current presets) keeps the classes.
    const _blocks = blocks.value
    const _sections = sections.value
    const _themeSettings = themeSettings.value
    const _layoutSettings = layoutSettings.value
    const _currentPage = currentPage.value
    const _initialConfig = initialConfig.value
    const _typographyPresets = typographyPresets.value
    const _typographyRoles = typographyRoles.value
    return buildPreviewConfig()
  })

  // ── Page actions ──

  async function fetchPages() {
    if (!siteId.value) return
    _ownLoading.value = true
    _ownError.value = null
    try {
      const data = await adminFetch<{ pages: any[] }>(`${siteStore.apiBase}/pages`)
      pageStore.setPages(data.pages)
    } catch (e: any) {
      _ownError.value = e.message || 'Failed to fetch pages'
    } finally {
      _ownLoading.value = false
    }
  }

  /**
   * Fetch a page and replace every page-bound domain store with its
   * authoritative server state. This is deliberately separate from
   * `switchPage`: bootstrapping may hydrate directly, while every user-driven
   * switch must flush the old page scope first.
   */
  // Monotonic sequence for page loads: only the LATEST hydratePage call may
  // hydrate the stores. Without this, switching pages while an earlier fetch
  // is still in flight (e.g. picking a page from the dropdown during editor
  // boot, whose initial home fetch hasn't resolved yet) let the SLOWER
  // response win — silently reverting the user's selection to the old page.
  let pageFetchSeq = 0

  async function hydratePage(pageId: string): Promise<boolean> {
    if (!siteId.value) return false
    const previousPageId = currentPage.value?.id ?? null
    const seq = ++pageFetchSeq
    _ownLoading.value = true
    _ownError.value = null
    try {
      const data = await adminFetch<{ page: any }>(`${siteStore.apiBase}/pages/${pageId}`)
      // A newer hydration superseded this one while awaiting — drop the
      // stale response instead of clobbering the user's later selection.
      if (seq !== pageFetchSeq) return false

      // Invalidate any old-page scene request before changing the page store.
      sceneStore.resetForPageChange()
      pageStore.setCurrentPage(data.page)
      blockStore.initFromPage(data.page.blocks || [])
      sectionStore.setSections(data.page.sections || [])
      sectionStore.setActiveSection(null)
      // Global theme settings are site-scoped, so changing the previewed page
      // should not close the inspector (or invalidate a ?mode=theme deep link).
      // Page-bound selections still need to be cleared.
      if (!selectionStore.showThemeSettings) {
        selectionStore.deselectAll()
      }
      activeChildPageSlug.value = null
      blockStore.clearBlockHistory()
      previewRouteParams.value = {}

      // A caller may only reach authoritative replacement after the old scope
      // has been flushed. Remove its completed coordinator metadata now; site-
      // scoped theme/layout work intentionally survives page navigation.
      if (previousPageId) changeStore.discardScope(editorChangeScope.page(previousPageId))

      // Keep the blocking hydration boundary in place until scenes have an
      // authoritative baseline. Scene persistence replaces the complete list,
      // so exposing the editor before this GET resolves could let an early edit
      // save an incomplete list. Run it beside layout hydration to avoid adding
      // their latencies together.
      await Promise.all([
        fetchStaticLayoutComponents(data.page.layout || 'default'),
        sceneStore.loadPageScenes(),
      ])
      if (seq !== pageFetchSeq) return false
      // Load sections for this page if not included in the page response
      if (!data.page.sections?.length) {
        void sectionStore.fetchSections(pageId)
      }
      return true
    } catch (e: any) {
      if (seq === pageFetchSeq) _ownError.value = e.message || 'Failed to fetch page'
      return false
    } finally {
      // Don't let a superseded call clear the loading flag out from under
      // the in-flight latest one.
      if (seq === pageFetchSeq) _ownLoading.value = false
    }
  }

  /** Flush the active page before changing its authoring context. */
  async function switchPage(pageId: string): Promise<boolean> {
    if (!siteId.value) return false
    if (currentPage.value?.id === pageId && !activeChildPageSlug.value) return true

    _ownLoading.value = true
    if (!await flushSiteScopedInspectorForPageHydration()) {
      _ownLoading.value = false
      return false
    }
    const previousPageId = currentPage.value?.id
    if (previousPageId) {
      const result = await changeStore.flushScope(editorChangeScope.page(previousPageId), true)
      if (!result.ok) {
        _ownLoading.value = false
        return false
      }
    }
    return hydratePage(pageId)
  }

  /** Re-fetch the current page after first persisting every page-bound draft. */
  async function reloadCurrentPage(): Promise<boolean> {
    const pageId = currentPage.value?.id
    if (!pageId) return false
    _ownLoading.value = true
    if (!await flushSiteScopedInspectorForPageHydration()) {
      _ownLoading.value = false
      return false
    }
    const result = await changeStore.flushScope(editorChangeScope.page(pageId), true)
    if (!result.ok) {
      _ownLoading.value = false
      return false
    }
    return hydratePage(pageId)
  }

  /**
   * Persist one immutable page-details revision. Layout/meta, article, SEO,
   * and layout selection share this endpoint and coordinator key so full-page
   * responses cannot race each other and rewind local state.
   */
  async function updatePageDetails(
    pageId: string,
    patch: Record<string, any>,
    options: { shouldApplyResponse?: () => boolean } = {},
  ) {
    if (!siteId.value) return
    const apiBase = siteStore.apiBase
    const payload = deepClone(patch)
    _ownError.value = null
    try {
      const page = await changeStore.runOperation({
        key: `page:${pageId}:details:update`,
        label: 'Update page details',
        scope: editorChangeScope.page(pageId),
        run: async () => {
          const data = await adminFetch<{ page: any }>(
            `${apiBase}/pages/${pageId}`,
            { method: 'PUT', body: payload },
          )
          // Reconcile only fields owned by this request. Template settings and
          // other endpoint-specific state may have changed concurrently, and a
          // full-row replacement here would silently rewind those saves.
          if (
            currentPage.value?.id === pageId
            && options.shouldApplyResponse?.() !== false
          ) {
            const authoritativePatch = Object.fromEntries(
              Object.keys(payload).map(key => [key, deepClone(data.page[key])]),
            )
            pageStore.setCurrentPage({ ...currentPage.value, ...authoritativePatch })
          }
          return data.page
        },
      })
      _ownError.value = null
      return page
    } catch (e: any) {
      _ownError.value = e.message || 'Failed to update page settings'
      throw e
    }
  }

  /** Keep controlled page-detail fields stable while their save is debounced. */
  function previewPageDetails(pageId: string, patch: Record<string, any>): void {
    if (currentPage.value?.id !== pageId) return
    pageStore.setCurrentPage({ ...currentPage.value, ...deepClone(patch) })
  }

  /** Apply one authoritative template-settings response to its immutable page. */
  function confirmTemplateSettings(pageId: string, templateSettings: Record<string, any>): void {
    if (currentPage.value?.id !== pageId) return
    pageStore.setCurrentPage({
      ...currentPage.value,
      templateSettings: deepClone(templateSettings),
    })
  }

  // ── Schema actions ──

  async function fetchSchemas() {
    if (!siteId.value) return
    _ownLoading.value = true
    _ownError.value = null
    try {
      const data = await adminFetch<{ theme: any; schemas: any[]; schemaMigration?: any }>(
        `${siteStore.apiBase}/schemas`,
      )
      schemaStore.populateFromApiResponse(data)

      // Show notification if schemas were auto-migrated
      if (data.schemaMigration?.migrated) {
        const { useAlertStore } = await import('~/admin/stores/alertStore')
        const alertStore = useAlertStore()
        const summary = data.schemaMigration.diff?.summary || []
        const totalAdded = summary.reduce((acc: number, s: any) => acc + s.added.length, 0)
        const totalRemoved = summary.reduce((acc: number, s: any) => acc + s.removed.length, 0)
        const parts: string[] = []
        if (totalAdded > 0) parts.push(`${totalAdded} field(s) added`)
        if (totalRemoved > 0) parts.push(`${totalRemoved} field(s) removed`)
        alertStore.success(
          'Schema auto-migrated',
          `Block content updated: ${parts.join(', ')}.`,
          'editor',
        )
      }
    } catch (e: any) {
      _ownError.value = e.message || 'Failed to fetch schemas'
    } finally {
      _ownLoading.value = false
    }
  }

  // ── Theme / layout actions ──

  async function fetchThemeSettings() {
    if (!siteId.value) return
    _ownLoading.value = true
    _ownError.value = null
    try {
      const data = await adminFetch<{ schema: any[]; settings: Record<string, any>; groups?: any[] }>(
        `${siteStore.apiBase}/theme-settings`,
      )
      themeStore.setThemeSettings(data.settings || {}, data.schema || [], data.groups)
    } catch (e: any) {
      _ownError.value = e.message || 'Failed to fetch theme settings'
    } finally {
      _ownLoading.value = false
    }
  }

  async function updateThemeSettings(settings: Record<string, any>) {
    if (!siteId.value) return
    const targetSiteId = siteId.value
    const apiBase = siteStore.apiBase
    const payload = deepClone(settings)
    _ownError.value = null
    try {
      const updatedSettings = await changeStore.runOperation({
        key: `site:${targetSiteId}:theme:update`,
        label: 'Update theme settings',
        scope: editorChangeScope.site(targetSiteId),
        run: async () => {
          const data = await adminFetch<{ settings: Record<string, any> }>(
            `${apiBase}/theme-settings`,
            { method: 'PUT', body: payload },
          )
          themeStore.confirmThemeSettings(data.settings || {})
          return data.settings
        },
      })
      _ownError.value = null
      return updatedSettings
    } catch (e: any) {
      _ownError.value = e.message || 'Failed to update theme settings'
      throw e
    }
  }

  async function fetchLayoutSettings(type: string) {
    if (!siteId.value) return
    try {
      const data = await adminFetch<{ type: string; settings: Record<string, any> }>(
        `${siteStore.apiBase}/layout-settings/${type}`,
      )
      themeStore.setLayoutSettings(type, data.settings || {})
    } catch (e: any) {
      _ownError.value = e.message || `Failed to fetch ${type} settings`
    }
  }

  async function fetchAllLayoutSettings() {
    await Promise.all(
      layoutComponentTypes.value.map(type => fetchLayoutSettings(type)),
    )
  }

  async function fetchStaticLayoutComponents(layoutId: string) {
    const layouts = themeManifest.value?.layout?.layouts as Array<{ id: string; staticComponents?: string[] }> | undefined
    const layoutDef = layouts?.find((l: any) => l.id === layoutId)
    const staticComponents = layoutDef?.staticComponents ?? []
    await Promise.all(
      staticComponents.map(async (type: string) => {
        if (schemas.value[type] && !layoutSchemas.value[type]) {
          schemaStore.addLayoutSchema(type, schemas.value[type])
        }
        await fetchLayoutSettings(type)
      }),
    )
  }

  async function updateLayoutSettings(
    type: string,
    settings: Record<string, any>,
    options: { shouldApplyResponse?: () => boolean } = {},
  ) {
    if (!siteId.value) return
    const targetSiteId = siteId.value
    const apiBase = siteStore.apiBase
    const payload = deepClone(settings)
    _ownError.value = null
    try {
      const updatedSettings = await changeStore.runOperation({
        key: `site:${targetSiteId}:layout:${type}:update`,
        label: `Update ${type} layout`,
        scope: editorChangeScope.site(targetSiteId),
        run: async () => {
          const data = await adminFetch<{ type: string; settings: Record<string, any> }>(
            `${apiBase}/layout-settings/${type}`,
            { method: 'PUT', body: payload },
          )
          // Normalised like updateThemeSettings does: a response without
          // `settings` must not merge undefined into the store, and callers
          // that read the return as "the write landed" must not see a
          // successful PUT as a failure.
          const settings = data.settings ?? {}
          if (options.shouldApplyResponse?.() !== false) {
            themeStore.mergeLayoutSettings(type, settings)
          }
          return settings
        },
      })
      _ownError.value = null
      return updatedSettings
    } catch (e: any) {
      _ownError.value = e.message || `Failed to update ${type} settings`
      throw e
    }
  }

  // ── Block actions (manage blockStore state + proxy saving/error) ──

  /**
   * Internal: create a block from a full payload (type + settings + optional
   * options / events / section / layoutRole / placement), insert it at
   * `position` (null = append), sync local state, and select it. Undoable.
   * Shared by addBlock, duplicateBlock and pasteBlock.
   */
  async function createBlock(payload: {
    type: string
    position?: number | null
    settings?: Record<string, any>
    options?: Record<string, any>
    events?: string[]
    sectionId?: string
    layoutRole?: string
    placement?: BlockPlacementConfig
  }): Promise<Block | null> {
    if (!siteId.value || !currentPage.value) return null
    const pageId = currentPage.value.id
    const operationKey = editorChangeKey.structure(pageId)
    if (changeStore.hasOperation(operationKey)) return null

    if (hasActiveInspectorWork() && !await flushActiveInspector()) return null
    if (currentPage.value?.id !== pageId) return null
    if (changeStore.hasOperation(operationKey)) return null

    const apiBase = siteStore.apiBase
    const request = deepClone(payload)

    const historyRecorded = blockStore.pushBlockHistory()

    _ownError.value = null
    try {
      const create = async () => {
        const position = request.position ?? null
        const body: Record<string, any> = {
          type: request.type,
          position: position !== null ? position : blocks.value.length,
          settings: request.settings || {},
        }
        if (request.options != null) body.options = request.options
        if (request.events != null) body.events = request.events
        if (request.sectionId) body.sectionId = request.sectionId
        if (request.layoutRole) body.layoutRole = request.layoutRole
        if (request.placement != null) body.placement = request.placement

        const data = await adminFetch<{ block: Block }>(
          `${apiBase}/pages/${pageId}/blocks`,
          { method: 'POST', body },
        )

        if (currentPage.value?.id === pageId) {
          if (position !== null) {
            blocks.value.splice(position, 0, data.block)
            blocks.value.forEach((b, i) => b.position = i)
          } else {
            blocks.value.push(data.block)
          }

          blockStore.blockPlacement[data.block.id] = data.block.placement ?? {}
          sectionStore.setActiveSection(data.block.sectionId ?? null)
          selectionStore.selectBlock(data.block.id)
        }
        return data.block
      }

      const created = await changeStore.runOperation({
        key: operationKey,
        label: 'Create block',
        scope: editorChangeScope.page(pageId),
        barrier: true,
        run: create,
      })
      _ownError.value = null
      return created
    } catch (e: any) {
      _ownError.value = e.message || 'Failed to add block'
      // The API call never completed — discard the pre-op snapshot.
      if (historyRecorded) blockStore.discardLastHistoryEntry()
      return null
    }
  }

  async function addBlock(
    type: string,
    position: number | null = null,
    presetSettings?: Record<string, any>,
    sectionId?: string,
    layoutRole?: string,
  ): Promise<Block | null> {
    return createBlock({ type, position, settings: presetSettings, sectionId, layoutRole })
  }

  /**
   * Duplicate a block in place — clones its full config (settings, options,
   * events, layoutRole, placement) into a new block inserted right after the
   * source, in the same section. Undoable.
   */
  async function duplicateBlock(blockId: string): Promise<Block | null> {
    const job = changeStore.getJob(editorChangeKey.block(blockId))
    if (job && !await changeStore.flushJob(job.key, true)) return null
    const idx = blocks.value.findIndex(b => b.id === blockId)
    if (idx === -1) return null
    const src = blocks.value[idx]
    if (!src) return null
    const placement = blockStore.getBlockPlacement(blockId)
    return createBlock({
      type: src.type,
      position: idx + 1,
      settings: deepClone(src.settings ?? {}),
      options: src.options ? deepClone(src.options) : undefined,
      events: src.events ? [...src.events] : undefined,
      sectionId: src.sectionId ?? undefined,
      layoutRole: src.layoutRole ?? undefined,
      placement: placement && Object.keys(placement).length > 0 ? deepClone(placement) : undefined,
    })
  }

  /**
   * Copy a block's full config to the editor clipboard so it can be pasted
   * onto this or another page. `label` is captured for the paste affordance.
   */
  async function copyBlock(blockId: string, label: string): Promise<boolean> {
    const job = changeStore.getJob(editorChangeKey.block(blockId))
    if (job && !await changeStore.flushJob(job.key, true)) return false
    const src = blocks.value.find(b => b.id === blockId)
    if (!src) return false
    const placement = blockStore.getBlockPlacement(blockId)
    clipboardStore.copy({
      type: src.type,
      label,
      settings: deepClone(src.settings ?? {}),
      options: src.options ? deepClone(src.options) : undefined,
      events: src.events ? [...src.events] : undefined,
      layoutRole: src.layoutRole ?? null,
      placement: placement && Object.keys(placement).length > 0 ? deepClone(placement) : undefined,
    })
    return true
  }

  /**
   * Paste the clipboard block onto the current page, appended to the currently
   * selected section (or the page when no section is selected). Works across
   * pages within the session. Fails loudly (sets error) if the block type is
   * not allowed on the current page's theme/layout — the create API returns 422.
   */
  async function pasteBlock(): Promise<Block | null> {
    const clip = clipboardStore.copiedBlock
    if (!clip) return null
    // Land the paste where the author is looking: the selected section, else
    // the section of the currently selected block, else the page (orphaned).
    const selectedBlockSection = selectedBlockId.value
      ? blocks.value.find(b => b.id === selectedBlockId.value)?.sectionId
      : null
    const targetSectionId = activeSectionId.value ?? selectedBlockSection ?? undefined
    return createBlock({
      type: clip.type,
      position: null,
      settings: deepClone(clip.settings ?? {}),
      options: clip.options ? deepClone(clip.options) : undefined,
      events: clip.events ? [...clip.events] : undefined,
      sectionId: targetSectionId ?? undefined,
      layoutRole: clip.layoutRole ?? undefined,
      placement: clip.placement ? deepClone(clip.placement) : undefined,
    })
  }

  async function updateBlock(
    blockId: string,
    settings: Record<string, any>,
    options: { shouldApplyResponse?: () => boolean } = {},
  ): Promise<Block | undefined> {
    if (!siteId.value || !currentPage.value) return
    const pageId = currentPage.value.id
    const apiBase = siteStore.apiBase
    const payload = deepClone(settings)
    _ownError.value = null
    try {
      const block = await changeStore.runOperation({
        key: `page:${pageId}:block:${blockId}:update`,
        label: 'Update block',
        scope: editorChangeScope.page(pageId),
        run: async () => {
          const data = await adminFetch<{ block: Block }>(
            `${apiBase}/pages/${pageId}/blocks/${blockId}`,
            { method: 'PUT', body: payload },
          )
          if (
            currentPage.value?.id === pageId
            && options.shouldApplyResponse?.() !== false
          ) {
            reconcileBlockResponse(blockId, data.block, payload)
          }
          return data.block
        },
      })
      _ownError.value = null
      return block
    } catch (e: any) {
      _ownError.value = e.message || 'Failed to update block'
      throw e
    }
  }

  /**
   * Write one deep path inside a block's settings.
   *
   * `updateBlock` cannot serve this mode: `reconcileBlockResponse` patches only
   * the keys present in the request, and a `{ fieldPath, value }` body has
   * none — the row would change while the local block did not, which breaks the
   * live preview and drifts local state (assistant spec §5.7.4).
   *
   * Deliberately does not push block history: callers that apply several writes
   * as one user-visible change own the undo boundary and push once around it.
   */
  async function updateBlockField(
    blockId: string,
    fieldPath: string,
    value: unknown,
  ): Promise<Block | undefined> {
    // The handler only takes its deep-path branch when `value !== undefined`;
    // an undefined value falls through to the shallow merge and would write
    // literal `fieldPath` / `value` keys into the block's settings. `null` is a
    // legitimate clear and must still pass.
    if (value === undefined) {
      throw new Error('updateBlockField requires a value (use null to clear); got undefined')
    }
    if (!siteId.value || !currentPage.value) return
    const pageId = currentPage.value.id
    const apiBase = siteStore.apiBase

    const index = blocks.value.findIndex(block => block.id === blockId)
    const current = index >= 0 ? blocks.value[index] : undefined
    if (!current) return

    const previousSettings = deepClone(current.settings || {})
    const nextSettings = deepSet(deepClone(current.settings || {}), fieldPath, value)
    previewBlockSettingsInState(blocks.value, blockId, nextSettings)

    _ownError.value = null
    try {
      const block = await changeStore.runOperation({
        key: `page:${pageId}:block:${blockId}:field`,
        label: 'Update block field',
        scope: editorChangeScope.page(pageId),
        run: async () => {
          const data = await adminFetch<{ block: Block }>(
            `${apiBase}/pages/${pageId}/blocks/${blockId}`,
            { method: 'PUT', body: { fieldPath, value } },
          )
          if (currentPage.value?.id === pageId) {
            const authoritative = deepGet((data.block.settings ?? {}) as Record<string, any>, fieldPath)
            const settingsIndex = blocks.value.findIndex(b => b.id === blockId)
            const settingsCurrent = settingsIndex >= 0 ? blocks.value[settingsIndex] : undefined
            if (settingsCurrent) {
              previewBlockSettingsInState(
                blocks.value,
                blockId,
                deepSet(deepClone(settingsCurrent.settings || {}), fieldPath, authoritative),
              )
            }
          }
          return data.block
        },
      })
      _ownError.value = null
      return block
    } catch (e: any) {
      // Unlike `patchBlockItem`'s retryable draft, a failed agent write must not
      // leave a value in the preview that no row holds.
      if (currentPage.value?.id === pageId) {
        previewBlockSettingsInState(blocks.value, blockId, previousSettings)
      }
      _ownError.value = e.message || 'Failed to update block field'
      throw e
    }
  }

  /**
   * Merge a partial patch into a single item inside a block's `settings.items`
   * array without rewriting unrelated items. Used by interactive substrates
   * (e.g. scatter-collage drag/nudge) that need per-item persistence granularity.
   *
   * Silent no-op when the block, its items array, or the target item is missing.
   */
  async function patchBlockItem(
    blockId: string,
    itemId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const jobKey = editorChangeKey.block(blockId)

    // Form edits and canvas item gestures both write the block's complete
    // settings object. Serialize them through one key before reading the base
    // state so neither path can rebuild from a stale snapshot.
    if (changeStore.getJob(jobKey)) {
      const flushed = await changeStore.flushJob(jobKey, true)
      if (!flushed) {
        const job = changeStore.getJob(jobKey)
        throw new Error(job?.error ?? job?.blockedReason ?? 'Could not save block changes')
      }
    }

    const pageId = currentPage.value?.id
    const apiBase = siteStore.apiBase
    if (!pageId || !apiBase) {
      throw new Error('Cannot save a canvas item without an active page and site')
    }

    // Re-read after the flush: the preceding settings response may have
    // replaced this block with its authoritative server representation.
    const blockIdx = blocks.value.findIndex(b => b.id === blockId)
    if (blockIdx < 0) {
      console.warn('[editorStore.patchBlockItem] block not found', { blockId, itemId })
      return
    }
    const block = blocks.value[blockIdx]
    if (!block) return
    const items = (block.settings as any)?.items
    if (!Array.isArray(items)) {
      console.warn('[editorStore.patchBlockItem] block has no items array', { blockId, itemId })
      return
    }
    const itemIdx = items.findIndex((it: any) => it?.id === itemId)
    if (itemIdx < 0) {
      const availableIds = items.map((it: any) => it?.id).filter(Boolean)
      console.warn('[editorStore.patchBlockItem] item not found', { blockId, itemId, availableIds })
      return
    }

    blockStore.pushBlockHistory()

    const nextItems = items.map((it: any, i: number) =>
      i === itemIdx ? { ...it, ...patch, id: it.id } : it,
    )
    const nextSettings = deepClone({ ...(block.settings || {}), items: nextItems })

    // Keep the canvas and any mounted inspector in sync immediately. A failed
    // request intentionally leaves this retryable draft visible.
    previewBlockSettingsInState(blocks.value, blockId, nextSettings)
    changeStore.queue({
      key: jobKey,
      surface: 'block',
      scope: editorChangeScope.page(pageId),
      label: `Block ${block.type}`,
      delay: 0,
      run: async ({ isCurrent }) => {
        const data = await adminFetch<{ block: Block }>(
          `${apiBase}/pages/${pageId}/blocks/${blockId}`,
          { method: 'PUT', body: nextSettings },
        )
        if (isCurrent() && currentPage.value?.id === pageId) {
          reconcileBlockResponse(blockId, data.block, nextSettings)
        }
      },
    })

    if (!await changeStore.flushJob(jobKey, true)) {
      const job = changeStore.getJob(jobKey)
      throw new Error(job?.error ?? job?.blockedReason ?? 'Could not save canvas item')
    }
  }

  async function deleteBlock(blockId: string): Promise<boolean> {
    if (!siteId.value || !currentPage.value) return false
    const pageId = currentPage.value.id
    const apiBase = siteStore.apiBase
    const jobKey = editorChangeKey.block(blockId)
    const placementJobKey = editorChangeKey.placement(pageId, blockId)
    const operationKey = editorChangeKey.structure(pageId)
    if (changeStore.hasOperation(operationKey)) return false
    const targetSaveKeys = [jobKey, placementJobKey]
      .filter(key => changeStore.getJob(key) !== null)
    if (targetSaveKeys.length > 0) {
      const result = await changeStore.flushKeys(targetSaveKeys, true)
      if (!result.ok) return false
    }
    if (currentPage.value?.id !== pageId || changeStore.hasOperation(operationKey)) return false

    const historyRecorded = blockStore.pushBlockHistory()

    _ownError.value = null
    try {
      await changeStore.runOperation({
        key: operationKey,
        label: 'Delete block',
        scope: editorChangeScope.page(pageId),
        barrier: true,
        run: async () => {
          await adminFetch(`${apiBase}/pages/${pageId}/blocks/${blockId}`, {
            method: 'DELETE',
          })
          if (currentPage.value?.id !== pageId) return
          blockStore.removeBlockFromState(blockId)
          if (editorMode.value.type === 'block' && editorMode.value.blockId === blockId) {
            selectionStore.deselectAll()
          }
          changeStore.discardJob(jobKey)
          changeStore.discardJob(placementJobKey)
        },
      })
      return true
    } catch (e: any) {
      _ownError.value = e.message || 'Failed to delete block'
      if (historyRecorded) blockStore.discardLastHistoryEntry()
      return false
    }
  }

  async function reorderBlocks(newOrder: string[]) {
    if (!siteId.value || !currentPage.value) return
    const pageId = currentPage.value.id
    const apiBase = siteStore.apiBase
    const operationKey = editorChangeKey.structure(pageId)
    if (changeStore.hasOperation(operationKey)) return
    const order = [...newOrder]

    const historyRecorded = blockStore.pushBlockHistory()

    const previousBlocks = blocks.value.map(block => deepClone(block))
    const previousOrder = previousBlocks.map(block => block.id)

    // Optimistic update
    blocks.value = order.map((id, index) => {
      const block = blocks.value.find(b => b.id === id)!
      return { ...block, position: index }
    })

    _ownError.value = null
    try {
      await changeStore.runOperation({
        key: operationKey,
        label: 'Reorder blocks',
        scope: editorChangeScope.page(pageId),
        barrier: true,
        run: async () => {
          await adminFetch(`${apiBase}/pages/${pageId}/blocks/reorder`, {
            method: 'PUT',
            body: { order },
          })
        },
      })
    } catch (e: any) {
      if (currentPage.value?.id === pageId) {
        const currentById = new Map(blocks.value.map(block => [block.id, block]))
        const previousById = new Map(previousBlocks.map(block => [block.id, block]))
        blocks.value = previousOrder.map((id, position) => ({
          ...(currentById.get(id) ?? previousById.get(id)!),
          position,
        }))
      }
      _ownError.value = e.message || 'Failed to reorder blocks'
      if (historyRecorded) blockStore.discardLastHistoryEntry()
    }
  }

  async function undoBlockChange(): Promise<boolean> {
    if (!siteId.value || !currentPage.value || !canUndoBlocks.value) return false

    const pageId = currentPage.value.id
    const apiBase = siteStore.apiBase
    const scope = editorChangeScope.page(pageId)
    const operationKey = editorChangeKey.structure(pageId)
    if (changeStore.hasOperation(operationKey)) return false
    const hasPendingWork = changeStore.jobList.some(job => job.scope === scope)
      || changeStore.operationList.some(operation => operation.scope === scope)
    if (hasPendingWork) {
      const flushed = await changeStore.flushScope(scope, true)
      if (!flushed.ok) return false
    }
    if (currentPage.value?.id !== pageId || changeStore.hasOperation(operationKey)) return false
    blockStore.discardPlacementSaves()

    const currentSnapshot = JSON.stringify(blocks.value)
    const previousSnapshot = blockStore.popHistoryForUndo()
    if (!previousSnapshot) return false

    blocks.value = JSON.parse(previousSnapshot)
    blockStore.syncPlacementFromBlocks()

    try {
      const replacement = deepClone(blocks.value)
      await changeStore.runOperation({
        key: operationKey,
        label: 'Undo block change',
        scope: editorChangeScope.page(pageId),
        barrier: true,
        run: async () => {
          await adminFetch(`${apiBase}/pages/${pageId}/blocks/replace-all`, {
            method: 'PUT',
            body: { blocks: replacement },
          })
        },
      })
      return true
    } catch (e: any) {
      blockStore.rollbackUndo(previousSnapshot, currentSnapshot)
      blockStore.syncPlacementFromBlocks()
      _ownError.value = e.message || 'Failed to undo block change'
      return false
    }
  }

  async function redoBlockChange(): Promise<boolean> {
    if (!siteId.value || !currentPage.value || !canRedoBlocks.value) return false

    const pageId = currentPage.value.id
    const apiBase = siteStore.apiBase
    const scope = editorChangeScope.page(pageId)
    const operationKey = editorChangeKey.structure(pageId)
    if (changeStore.hasOperation(operationKey)) return false
    const hasPendingWork = changeStore.jobList.some(job => job.scope === scope)
      || changeStore.operationList.some(operation => operation.scope === scope)
    if (hasPendingWork) {
      const flushed = await changeStore.flushScope(scope, true)
      if (!flushed.ok) return false
    }
    if (currentPage.value?.id !== pageId || changeStore.hasOperation(operationKey)) return false
    blockStore.discardPlacementSaves()

    const currentSnapshot = JSON.stringify(blocks.value)
    const nextSnapshot = blockStore.popHistoryForRedo()
    if (!nextSnapshot) return false

    blocks.value = JSON.parse(nextSnapshot)
    blockStore.syncPlacementFromBlocks()

    try {
      const replacement = deepClone(blocks.value)
      await changeStore.runOperation({
        key: operationKey,
        label: 'Redo block change',
        scope: editorChangeScope.page(pageId),
        barrier: true,
        run: async () => {
          await adminFetch(`${apiBase}/pages/${pageId}/blocks/replace-all`, {
            method: 'PUT',
            body: { blocks: replacement },
          })
        },
      })
      return true
    } catch (e: any) {
      blockStore.rollbackRedo(nextSnapshot, currentSnapshot)
      blockStore.syncPlacementFromBlocks()
      _ownError.value = e.message || 'Failed to redo block change'
      return false
    }
  }

  // ── Preview actions ──

  async function fetchPreviewConfig() {
    if (!siteId.value) return
    _ownLoading.value = true
    _ownError.value = null
    try {
      const data = await adminFetch<{ config: any; warnings?: string[] }>(`${siteStore.apiBase}/preview-config`)
      initialConfig.value = data.config
      previewWarnings.value = data.warnings ?? []
    } catch (e: any) {
      _ownError.value = e.message || 'Failed to fetch preview config'
    } finally {
      _ownLoading.value = false
    }
  }

  // ── Navigation ──

  async function setCurrentPageBySlug(slugOrId: string): Promise<boolean> {
    // Check if it's a child site mount path
    const childMatch = childSitePages.value.find(c => c.mountPath === slugOrId)
    if (childMatch) {
      return navigateToChildPage(childMatch.mountPath)
    }

    const page = pages.value.find(p => p.slug === slugOrId || p.id === slugOrId)
    if (!page) return false
    return switchPage(page.id)
  }

  function setPreviewRouteParam(key: string, value: string) {
    previewRouteParams.value = { ...previewRouteParams.value, [key]: value }
  }

  /**
   * Navigate to a child site's mount page in the preview.
   * This doesn't fetch from DB — the page data is already in initialConfig.
   */
  async function navigateToChildPage(mountPath: string): Promise<boolean> {
    if (activeChildPageSlug.value === mountPath) return true
    _ownLoading.value = true
    if (!await flushSiteScopedInspectorForPageHydration()) {
      _ownLoading.value = false
      return false
    }
    const previousPageId = currentPage.value?.id
    if (previousPageId) {
      const result = await changeStore.flushScope(editorChangeScope.page(previousPageId), true)
      if (!result.ok) {
        _ownLoading.value = false
        return false
      }
    }

    // Supersede an in-flight page request before replacing the context with a
    // config-backed child mount.
    pageFetchSeq++
    sceneStore.resetForPageChange()

    activeChildPageSlug.value = mountPath
    pageStore.setCurrentPage(null)
    blockStore.setBlocks([])
    selectionStore.deselectAll()
    blockStore.clearBlockHistory()
    previewRouteParams.value = {}
    if (previousPageId) changeStore.discardScope(editorChangeScope.page(previousPageId))
    _ownLoading.value = false
    return true
  }

  // ── Section actions (proxy exposes sectionStore CRUD + cross-store ops) ──

  /** Duplicate a section and its blocks as one structural operation. */
  async function duplicateSection(pageId: string, sectionId: string) {
    if (!siteId.value) return null
    const apiBase = siteStore.apiBase
    const operationKey = editorChangeKey.structure(pageId)
    if (changeStore.hasOperation(operationKey)) return null

    const sectionJobKey = editorChangeKey.section(pageId, sectionId)
    if (changeStore.getJob(sectionJobKey) && !await changeStore.flushJob(sectionJobKey, true)) {
      return null
    }
    if (currentPage.value?.id !== pageId || changeStore.hasOperation(operationKey)) return null

    try {
      _ownError.value = null
      sectionStore.error = null
      return await changeStore.runOperation({
        key: operationKey,
        label: 'Duplicate section',
        scope: editorChangeScope.page(pageId),
        barrier: true,
        run: async () => {
          const data = await adminFetch<{ section: Section; blocks: Block[] }>(
            `${apiBase}/pages/${pageId}/sections/${sectionId}/duplicate`,
            { method: 'POST' },
          )

          if (currentPage.value?.id === pageId) {
            const originalIdx = sections.value.findIndex(s => s.id === sectionId)
            if (originalIdx !== -1) {
              sections.value.splice(originalIdx + 1, 0, data.section)
              sections.value.forEach((s, i) => s.position = i)
            } else {
              sections.value.push(data.section)
            }

            if (data.blocks?.length) {
              blocks.value.push(...data.blocks)
              blocks.value.sort((a, b) => a.position - b.position)
            }

            sectionStore.setActiveSection(data.section.id)
            selectionStore.deselectAll()
            // A block-only undo would remove the copied blocks but leave their
            // duplicated section behind, so this aggregate starts a new block
            // history boundary.
            blockStore.clearBlockHistory()
          }
          return data.section
        },
      })
    } catch (e: any) {
      _ownError.value = e.message || 'Failed to duplicate section'
      return null
    }
  }

  /** Create a preset section and all of its blocks in one server transaction. */
  async function createSectionFromPreset(pageId: string, preset: any, name?: string) {
    if (!siteId.value || !currentPage.value) return null
    const operationKey = editorChangeKey.structure(pageId)
    if (changeStore.hasOperation(operationKey)) return null

    if (hasActiveInspectorWork() && !await flushActiveInspector()) return null
    if (currentPage.value?.id !== pageId || changeStore.hasOperation(operationKey)) return null

    const apiBase = siteStore.apiBase
    _ownError.value = null

    try {
      return await changeStore.runOperation({
        key: operationKey,
        label: 'Create section from preset',
        scope: editorChangeScope.page(pageId),
        barrier: true,
        run: async () => {
          const data = await adminFetch<{ section: Section; blocks: Block[] }>(
            `${apiBase}/pages/${pageId}/sections/with-blocks`,
            {
              method: 'POST',
              body: {
                section: {
                  name: name || preset.label?.['en-US'] || preset.label,
                  sectionType: preset.sectionType,
                  layoutConfig: preset.layoutConfig || {},
                  position: sections.value.length,
                  ...(preset.colorScheme ? { colorScheme: preset.colorScheme } : {}),
                  ...(preset.containerMode ? { containerMode: preset.containerMode } : {}),
                },
                blocks: (preset.blocks ?? []).map((presetBlock: any) => ({
                  type: presetBlock.type,
                  settings: presetBlock.settings || {},
                  layoutRole: presetBlock.layoutRole,
                  ...(presetBlock.options !== undefined ? { options: presetBlock.options } : {}),
                  ...(presetBlock.events !== undefined ? { events: presetBlock.events } : {}),
                  ...(presetBlock.placement !== undefined ? { placement: presetBlock.placement } : {}),
                })),
              },
            },
          )

          if (currentPage.value?.id === pageId) {
            sectionStore.setSections([...sections.value, data.section])
            for (const block of data.blocks) {
              blockStore.addBlockToState(block)
            }
            sectionStore.setActiveSection(data.section.id)
            selectionStore.deselectAll()
            // Block-only snapshots cannot faithfully undo a section aggregate:
            // restoring just the blocks would leave an empty section behind.
            // Treat this as an explicit history boundary until structural
            // history can restore sections and blocks transactionally together.
            blockStore.clearBlockHistory()
          }

          _ownError.value = null
          return data.section
        },
      })
    } catch (e: any) {
      _ownError.value = e.message || 'Failed to create section from preset'
      return null
    }
  }

  // ── Wrapped scene mutations ──
  //
  // Scene mutations delegate to sceneStore, which contributes immutable jobs
  // to the same coordinator as every other editor surface.

  function addScene(scene: import('~/shared/types/animation').AnimationScene): void {
    sceneStore.addScene(scene)
  }

  function updateScene(
    sceneId: string,
    updates: Partial<import('~/shared/types/animation').AnimationScene>,
  ): void {
    sceneStore.updateScene(sceneId, updates)
  }

  function removeScene(sceneId: string): void {
    sceneStore.removeScene(sceneId)
  }

  function addEntry(
    sceneId: string,
    entry: import('~/shared/types/animation').AnimationEntry,
  ): void {
    sceneStore.addEntry(sceneId, entry)
  }

  function updateEntry(
    sceneId: string,
    entryId: string,
    updates: Partial<import('~/shared/types/animation').AnimationEntry>,
  ): void {
    sceneStore.updateEntry(sceneId, entryId, updates)
  }

  function removeEntry(sceneId: string, entryId: string): void {
    sceneStore.removeEntry(sceneId, entryId)
  }

  // ── Wrapped section selectSection (also clears block selection) ──

  async function selectSection(sectionId: string | null): Promise<boolean> {
    if (selectedSectionId.value === sectionId) return true
    if (hasActiveInspectorWork() && !await flushActiveInspector()) return false
    sectionStore.setActiveSection(sectionId)
    if (sectionId) selectionStore.selectSection(sectionId)
    else selectionStore.deselectAll()
    return true
  }

  // ── Return: every property from the original store, preserving names ────

  return {
    // ── Selection (from selectionStore via storeToRefs) ──
    editorMode,
    selectedBlockId,
    showThemeSettings,
    showPageSettings,
    selectedLayoutType,
    showLayoutSettings,
    // Selection actions (direct delegation)
    selectBlock,
    selectThemeSettings,
    selectPageSettings,
    selectLayoutComponent,
    deselectAll,

    // ── Pages (from pageStore via storeToRefs) ──
    pages,
    currentPage,
    topLevelPages,
    dynamicSlugParams,
    // Page helpers (direct delegation)
    getParentSlug: pageStore.getParentSlug,
    getAncestorSlugs: pageStore.getAncestorSlugs,

    // ── Blocks (from blockStore via storeToRefs) ──
    blocks,
    blockPlacement,
    canUndoBlocks,
    canRedoBlocks,
    // Placement helpers (direct delegation)
    getBlockPlacement: blockStore.getBlockPlacement,
    updateBlockPlacement: blockStore.updateBlockPlacement,

    // ── Schemas (from schemaStore via storeToRefs) ──
    schemas,
    themeManifest,
    layoutComponentTypes,
    locales,
    defaultLocale,
    editingLocale,
    layoutSchemas,

    // ── Theme + layout (from themeStore via storeToRefs) ──
    themeSettings,
    themeSettingsSchema,
    themeSettingsGroups,
    layoutSettings,
    layoutMeta,
    setLayoutMeta: themeStore.setLayoutMeta,
    previewThemeSettings: themeStore.previewThemeSettings,
    previewLayoutSettings: themeStore.previewLayoutSettings,

    // ── Typography (from typographyStore via storeToRefs) ──
    typographyPresets,
    typographyRoles,
    // Typography actions (direct delegation)
    fetchTypographyPresets: typographyStore.fetchTypographyPresets,
    fetchTypographyRoles: typographyStore.fetchTypographyRoles,

    // ── Fonts (from fontStore via storeToRefs) ──
    fonts,
    fontsLoaded,
    fontsAvailable,
    fontsUsedBytes,
    fontsQuotaBytes,
    fontsMaxFileBytes,
    fontsUploading,
    fontsError,
    // Font actions (direct delegation)
    fetchFonts: fontStore.fetchFonts,
    uploadFont: fontStore.uploadFont,
    deleteFont: fontStore.deleteFont,

    // ── Scenes (from sceneStore via storeToRefs) ──
    scenes,
    scenesLoaded,
    selectedSceneId,
    selectedEntryId,
    // Scene async actions (direct delegation)
    loadPageScenes: sceneStore.loadPageScenes,
    selectScene: sceneStore.selectScene,
    selectEntry: sceneStore.selectEntry,
    // Scene mutation wrappers (sceneStore owns the scenes dirty source)
    addScene,
    updateScene,
    removeScene,
    addEntry,
    updateEntry,
    removeEntry,

    // ── Sections (from sectionStore via storeToRefs) ──
    sections,
    selectedSectionId,
    selectedSection,
    activeSectionId,
    activeSection,
    visibleSections,
    // Section async actions (direct delegation)
    fetchSections: sectionStore.fetchSections,
    createSection: sectionStore.createSection,
    updateSection: sectionStore.updateSection,
    deleteSection: sectionStore.deleteSection,
    reorderSections: sectionStore.reorderSections,
    changeSectionType: sectionStore.changeSectionType,
    // Section actions with cross-store side-effects
    selectSection,

    // ── Proxy-owned state ──
    siteId,
    initialConfig,
    previewWarnings,
    previewRouteParams,
    activeChildPageSlug,

    // ── Aggregated loading / saving / error ──
    loading,
    saving,
    error,
    ownError,

    // ── Cross-store computed properties ──
    selectedBlock,
    selectedBlockSchema,
    selectedLayoutSchema,
    showSectionSettings,
    sectionBlocks,
    orphanedBlocks,
    childSitePages,

    // ── Preview ──
    previewConfig,
    buildPreviewConfig,
    fetchPreviewConfig,

    // ── Block actions (proxy-owned, manage blockStore state + saving/error) ──
    addBlock,
    duplicateBlock,
    copyBlock,
    pasteBlock,
    updateBlock,
    updateBlockField,
    patchBlockItem,
    deleteBlock,
    reorderBlocks,
    undoBlockChange,
    redoBlockChange,
    clearBlockHistory: blockStore.clearBlockHistory,
    withHistorySuppressed: blockStore.withHistorySuppressed,
    moveBlockToSection: blockStore.moveBlockToSection,

    // ── Page actions ──
    fetchPages,
    hydratePage,
    switchPage,
    reloadCurrentPage,
    setCurrentPageBySlug,
    setPreviewRouteParam,
    navigateToChildPage,
    updatePageDetails,
    previewPageDetails,
    confirmTemplateSettings,

    // ── Schema actions ──
    fetchSchemas,

    // ── Theme / layout actions ──
    fetchThemeSettings,
    updateThemeSettings,
    fetchLayoutSettings,
    fetchAllLayoutSettings,
    updateLayoutSettings,
    fetchStaticLayoutComponents,

    // ── Cross-store section ops ──
    duplicateSection,
    createSectionFromPreset,
  }
})
