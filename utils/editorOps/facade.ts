import type { ValidatableField } from '~/admin/utils/editorOps/settingsValueValidation'
import { useEditorStore } from '~/admin/stores/editorStore'
import { useSectionStore, type SectionTypeChangeResult } from '~/admin/stores/sectionStore'
import { useBlockStore } from '~/admin/stores/blockStore'
import { useSchemaStore } from '~/admin/stores/schemaStore'
import { useSelectionStore } from '~/admin/stores/selectionStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import { useMediaLibraryStore } from '~/admin/stores/mediaLibraryStore'
import { useTypographyStore } from '~/admin/stores/typographyStore'
import { useEditorChangeStore, editorChangeKey } from '~/admin/stores/editorChangeStore'
import { useTypographyAdmin } from '~/admin/composables/useTypographyAdmin'
import {
  blockLabel, editorLayoutRoles, editorSectionTypeSchemas, editorThemeName,
} from '~/admin/composables/useAssistantEditorContext'
import { getSectionTypeSchemasV2 } from '~/shared/features/cms/sectionSchemas'
import { layeredSectionTypes } from '~/shared/features/cms/section-layouts/layeredSlots.mjs'
import { getEditableSurface } from '~/shared/features/cms/editableSurfaceClient'
import type { EditableSurfaceRegistry } from '~/shared/features/cms/editableSurface/types'
import type { BlockPlacementConfig } from '~/shared/types/placement'
import type { SplashEditorSectionType } from '~/admin/lib/protocol/types/splash-editor-ops'
import type { SplashEditorSelection } from '~/admin/lib/protocol/types/splash-editor-context'

export interface FacadeSection {
  id: string
  name: string
  position: number
  /**
   * Null for a section that carries no type. `update_layout_config` scopes its
   * registry lookup by this, and `set_block_placement` reads it through the
   * block's owning section to decide whether geometry is legal there at all.
   */
  sectionType: string | null
  /** The section's CURRENT layout settings — the merge base for a partial write. */
  layoutConfig: Record<string, unknown>
}
export interface FacadeBlock {
  id: string
  label: string
  type: string
  sectionId: string | null
  position: number
  /** Null when the block carries no role. Post-conditioned by `move_block`. */
  layoutRole: string | null
  settings: Record<string, unknown>
}
/**
 * Derived from the protocol shape rather than restated: `mode` is a closed
 * union there, and a local `mode: string` would not satisfy `TargetContext`.
 */
export type FacadeSelection = Pick<
  SplashEditorSelection, 'mode' | 'blockId' | 'sectionId' | 'activeSectionId'
>
export interface FacadePreset { id: string, name: string }
/** The slice of a schema field `attach_media` reasons about. */
export interface FacadeSettingField {
  /** The schema's declared field type, e.g. `image`, `video`, `image-gallery`. */
  type: string
  /** `options.valueMode` — 'id' or 'url'. Undefined when the field omits it. */
  valueMode?: string
}
export interface FacadeMedia {
  id: string
  url: string
  filename: string
  contentType: string
}

/**
 * Everything the executor is allowed to touch, behind one seam. Two reasons it
 * exists rather than the executor importing the stores directly:
 *
 * 1. `applyEditorOp` unit-tests against a double without mounting the editor —
 *    the alternative is a Pinia + Nuxt harness per op kind.
 * 2. It is an explicit inventory of the blast radius. Nothing reaches publish,
 *    version activate, page create/delete, site settings or users because none
 *    of it is on this interface (spec §7). Media is on it in ONE direction
 *    only — `lookupMedia` reads the library so `attach_media` can refuse an id
 *    that is not in it. No upload, no delete, no library write.
 *
 * `read*Error` exist because several actions return void and swallow failures
 * into an error ref [R11]. `editorStore.error` is a COMPUTED AGGREGATE
 * (editorStore.ts:183) — section actions must sample `readSectionError`.
 */
export interface EditorOpsFacade {
  // ── Live state ──
  // Read per op, never frozen per batch: an earlier op's create must be visible
  // to a later op's target resolution, and a delete must un-resolve.
  pageId(): string
  /**
   * The open page's type, or null when it declares none. Read for exactly one
   * decision: a brand-canvas page is free placement end to end, so geometry is
   * legal on it regardless of the section type — the first half of the server's
   * own canvas policy, which `set_block_placement` must not be stricter than.
   */
  pageType(): string | null
  sections(): readonly FacadeSection[]
  blocks(): readonly FacadeBlock[]
  selection(): FacadeSelection
  /**
   * The OPEN THEME's section types, not the global union (preflight S2). A
   * theme need not implement all four; validating against the union would let
   * the precondition pass and the store throw a server error instead of the
   * executor failing the op cleanly with a reason the model can act on.
   */
  knownSectionTypes(): readonly string[]
  knownBlockTypes(): readonly string[]
  /**
   * Block types a NEW block may be created as: the known set minus schemas
   * marked `status: 'deprecated'` (2026-09 composition unification U4 —
   * retired types still render from snapshots but are no longer authoring
   * targets). An op creating a retired type must fail with that reason, not
   * "succeed" into a block the add-menu refuses and the create endpoint
   * rejects.
   */
  insertableBlockTypes(): readonly string[]
  knownLayoutRoles(): readonly string[]
  /**
   * Declared setting ids for a block type, or null when no schema is loaded
   * for it (fail-open: an existing block whose schema is missing must not make
   * every field write fail). Guards `set_block_field` / `update_block_settings`
   * against model-invented paths: `updateBlockField` deep-sets ANY path into
   * settings, so a write to `options.heading` on a block whose field is
   * `heading` "succeeds", reports applied, and renders nothing (found live).
   */
  blockSettingIds(type: string): readonly string[] | null
  /**
   * The block type's full declared settings (the subset value validation
   * reads), or null when no schema is loaded (fail-open, like
   * `blockSettingIds`). Consumed by the settings-value validator for
   * `add_block` / `update_block_settings`.
   */
  blockSettingFields(type: string): readonly ValidatableField[] | null
  /**
   * One declared setting of a block type, or null when the schema — or the
   * setting within it — is unknown.
   *
   * `attach_media` needs the field's TYPE, which `blockSettingIds` throws away,
   * and its `valueMode`, which decides whether the field stores a URL or an id
   * (`TImagePicker` reads the same `options.valueMode`, defaulting to `url`).
   * Unlike the id gate this one fails CLOSED: an op whose whole premise is
   * "this is a media field" must not proceed when the host cannot see that it
   * is one.
   */
  blockSettingField(type: string, settingId: string): FacadeSettingField | null
  /**
   * The open theme's editable-surface registry, or null when the host cannot
   * build one for it (D2). The two registry-checked ops validate their target
   * and payload through the shared kernel against THIS, instead of restating
   * per-op vocabulary the schemas already carry (D8).
   *
   * Null fails those ops closed. Every entity class the two of them touch
   * declares `fail-closed` for a missing address, so answering with an empty
   * registry instead would produce the same refusals with a worse reason.
   */
  editableSurface(): EditableSurfaceRegistry | null
  /**
   * The section types of the open theme that declare a layered slot — the one
   * condition `placement.canvas` legality hangs on. Read from the theme's own
   * `.v2.json` schemas through the shared predicate, never a local `.some` over
   * declared flows: a type may reach `layered` through a `slot.<role>.flow`
   * binding, and missing that would refuse geometry for a section the author
   * legitimately switched over.
   */
  layeredSectionTypes(): ReadonlySet<string>

  // ── Media (read-only) ──
  /**
   * Resolve a media id in the OPEN SITE's library, or null when no such row
   * exists — including when the host could not reach the library at all, since
   * an unverified id and a missing one both have to refuse the write.
   */
  lookupMedia(mediaId: string): Promise<FacadeMedia | null>

  // ── Error refs (sample immediately BEFORE a void action) ──
  readSectionError(): string | null
  readEditorError(): string | null

  // ── Sections ──
  createSection(pageId: string, dto: Record<string, unknown>): Promise<{ id: string } | null>
  createSectionFromPreset(pageId: string, preset: Record<string, unknown>, name: string): Promise<{ id: string } | null>
  updateSection(pageId: string, sectionId: string, dto: Record<string, unknown>): Promise<{ id: string } | null>
  changeSectionType(pageId: string, sectionId: string, nextType: SplashEditorSectionType): Promise<SectionTypeChangeResult>
  deleteSection(pageId: string, sectionId: string): Promise<void>
  reorderSections(pageId: string, orderedIds: string[]): Promise<void>
  duplicateSection(pageId: string, sectionId: string): Promise<{ id: string } | null>

  // ── Blocks ──
  addBlock(
    type: string, position: number | null, presetSettings: Record<string, unknown> | undefined,
    sectionId: string | undefined, layoutRole: string | undefined,
  ): Promise<{ id: string } | null>
  /**
   * Flush the block's pending INSPECTOR save, returning false if the flush was
   * refused. Must be called before any write to that block.
   *
   * The inspector debounces edits into a job on `editorChangeKey.block(id)`,
   * while `updateBlock` / `updateBlockField` serialise on their own
   * `page:…:block:…:update|field` keys — a different lane, so neither waits for
   * the other. Without this, a pending inspector job flushed after the agent's
   * write silently reverts it, and the settings the executor reads as its merge
   * base can be an unsaved optimistic draft. `deleteBlock` and `patchBlockItem`
   * both flush this key first; the agent's writes have the same requirement.
   */
  flushBlockJob(blockId: string): Promise<boolean>
  /**
   * Flush EVERY block's pending inspector save on the page, returning false if
   * any flush was refused. Required before any write that serialises the whole
   * live block array.
   *
   * `moveBlockToSection` PUTs the entire `blocks.value` array to
   * `blocks/replace-all`, and `previewBlockSettingsInState` writes optimistic
   * drafts into that same array — so the move persists ANY block's unsaved
   * draft as though the author had saved it, including blocks the op never
   * named. Per-block flushing is not enough here: the blast radius is the page.
   *
   * `reorder_blocks` does not need this (it PUTs only an array of ids) and
   * `delete_block` does not either (the store flushes its own keys first).
   */
  flushPageBlockJobs(): Promise<boolean>
  updateBlock(blockId: string, settings: Record<string, unknown>): Promise<{ id: string } | undefined>
  updateBlockField(blockId: string, fieldPath: string, value: unknown): Promise<{ id: string } | undefined>
  deleteBlock(blockId: string): Promise<boolean>
  /** A block's CURRENT placement — the merge base, and the post-condition read. */
  blockPlacement(blockId: string): BlockPlacementConfig
  /**
   * Commit a block's placement, exactly as a canvas drag from the preview does.
   *
   * Synchronous local commit plus a queued save on the placement lane, so the
   * post-condition is the local state — the save's own failure surfaces through
   * the editor's change coordinator, the same place a human drag's would.
   */
  updateBlockPlacement(blockId: string, placement: BlockPlacementConfig): void
  reorderBlocks(pageGlobalOrder: string[]): Promise<void>
  moveBlockToSection(blockId: string, toSectionId: string, indexInSection: number, layoutRole?: string): Promise<boolean>

  // ── Page / theme / layout ──
  // NOT void, despite reading like it: all three RETURN the persisted row and
  // THROW on a server failure (editorStore.ts:740, 850, 910). They return
  // `undefined` only from `if (!siteId.value) return` — a silent guard that
  // records nothing. So the executor's post-condition is a DEFINED return, and
  // the throw carries the reason. Every one of these endpoints always answers
  // with its object, so a defined return cannot be a false negative.
  updatePageDetails(pageId: string, patch: Record<string, unknown>): Promise<Record<string, unknown> | undefined>
  updateThemeSettings(patch: Record<string, unknown>): Promise<Record<string, unknown> | undefined>
  updateLayoutSettings(layoutType: string, patch: Record<string, unknown>): Promise<Record<string, unknown> | undefined>

  // ── Typography ──
  typographyPresets(): readonly FacadePreset[]
  /**
   * EVERY system role the site defines, unmapped ones present as `null`. The
   * key set is the executor's role vocabulary — a role absent from this map is
   * reported to the model as unknown — and the merge base for the complete map
   * `saveTypographyRoles` PUTs. A map holding only the *mapped* roles would
   * make "clear this role" unaddressable and every unmapped role unknown.
   */
  typographyRoleMap(): Record<string, string | null>
  /**
   * Whether the role map has actually been loaded from the server (preflight
   * S3). `saveRoles` PUTs the COMPLETE map and the server replaces all
   * mappings, so merging into an unseeded (empty) map would clear every role on
   * the site. The executor refuses the op instead of guessing.
   */
  typographyRolesLoaded(): boolean
  /**
   * Refetch presets + roles, returning whether the load SUCCEEDED.
   *
   * The boolean is not a convenience: `useTypographyAdmin.fetchRoles` swallows
   * its failure into an `error` ref, and the role map it exposes enumerates
   * every system role (unmapped as null) whether or not the fetch ever ran — so
   * a failed load is indistinguishable from a loaded site by inspecting the map
   * alone, and `set_typography_roles` would merge into placeholder nulls and PUT
   * a map that clears every role. Implementations must return false when either
   * fetch failed (read the composable's `error` ref after `refresh()`).
   */
  refreshTypography(): Promise<boolean>
  updateTypographyPreset(presetId: string, dto: Record<string, unknown>): Promise<void>
  saveTypographyRoles(map: Record<string, string | null>): Promise<void>

  // ── Selection ──
  // Only these two: no op targets theme or page settings selection, and a
  // facade member with no caller is blast radius nothing asked for (I4).
  // Revisit if R3's proposal UI needs them.
  // Both go through `changeInspector`, which flushes the open inspector first
  // and returns false when it refuses — a select can genuinely fail.
  selectBlock(blockId: string): Promise<boolean>
  selectSection(sectionId: string): Promise<boolean>

  // ── History ──
  pushBlockHistory(): boolean
  clearBlockHistory(): void
  /** Run `fn` with inner pushBlockHistory calls suppressed (preflight S1). */
  withHistorySuppressed<T>(fn: () => Promise<T>): Promise<T>
}

/**
 * The one binding of the facade to live Pinia state. Every member maps to
 * exactly one existing store action (spec §5.4) — nothing here invents a write
 * path, and anything absent from `EditorOpsFacade` stays unreachable.
 *
 * Built ONCE per batch and reused for its whole run: `useTypographyAdmin` is a
 * plain composable with per-call refs, so a second call would seed a different
 * object than `typographyRoleMap` reads and leave `typographyRolesLoaded` false
 * forever (preflight S3).
 */
export function createLiveEditorOpsFacade(): EditorOpsFacade {
  const editorStore = useEditorStore()
  const sectionStore = useSectionStore()
  const blockStore = useBlockStore()
  const schemaStore = useSchemaStore()
  const selectionStore = useSelectionStore()
  const siteStore = useSiteStore()
  const mediaLibraryStore = useMediaLibraryStore()
  const typographyStore = useTypographyStore()
  const changeStore = useEditorChangeStore()
  const typographyAdmin = useTypographyAdmin()

  /**
   * `flushJob` answers true when the key has no job at all, so a clean block
   * costs nothing and a write is never refused for lack of pending work.
   * `focusBlocked` mirrors `duplicateBlock` / `deleteBlock`: when a job is
   * blocked by an invalid field, the operator is taken to it rather than left
   * with a refusal they cannot locate.
   */
  const flushBlock = (blockId: string) => changeStore.flushJob(editorChangeKey.block(blockId), true)

  return {
    // `currentPage` is guaranteed by the trust boundary (a batch never reaches
    // the executor without an open page) and re-read per op, so a mid-batch
    // navigation shows up as a changed — never absent — id.
    pageId: () => editorStore.currentPage?.id ?? '',
    pageType: () => editorStore.currentPage?.pageType ?? null,
    sections: () => sectionStore.sections.map(s => ({
      id: s.id,
      name: s.name,
      position: s.position,
      sectionType: s.sectionType ?? null,
      layoutConfig: s.layoutConfig ?? {},
    })),
    // ARRAY ORDER, never sorted by `position`. The store's array is the
    // authoritative order — it is what the editor renders, what
    // `blocks/replace-all` persists and what `reorderBlocks` rewrites — while
    // `position` is advisory and goes stale within a single batch:
    // `removeBlockFromState` filters without renumbering (blockStore.ts:198)
    // and `createBlock` with a null position does a bare `push`
    // (editorStore.ts:1017). Delete two blocks and append one and the survivors
    // carry HIGHER positions than the block appended after them, so a
    // position-sorted view reports an order the page does not have — and every
    // splice index, whole-page reorder and post-condition read back through it
    // would be wrong in the same direction that produced it. `orderedBlocks`
    // (applyEditorOp.ts:182) states the same contract from the other side, and
    // the digest's `buildOutline` groups in the same order — the fallback label
    // `"<type> #<n>"` counts the same sequence in both places, so an ordinal
    // the model quotes back names the block it read.
    blocks: () => {
      const perSection = new Map<string, number>()
      return editorStore.blocks.map((block) => {
        const key = block.sectionId ?? ''
        const index = perSection.get(key) ?? 0
        perSection.set(key, index + 1)
        return {
          id: block.id,
          label: blockLabel(block, index),
          type: block.type,
          sectionId: block.sectionId ?? null,
          position: block.position,
          layoutRole: block.layoutRole ?? null,
          settings: block.settings ?? {},
        }
      })
    },
    selection: () => {
      const mode = selectionStore.editorMode
      return {
        mode: mode.type,
        ...(mode.type === 'block' ? { blockId: mode.blockId } : {}),
        ...(mode.type === 'section' ? { sectionId: mode.sectionId } : {}),
        ...(sectionStore.activeSectionId ? { activeSectionId: sectionStore.activeSectionId } : {}),
      }
    },
    // Theme-scoped, not the global KNOWN_SECTION_TYPES union (preflight S2): a
    // theme ships its own section-type schemas, and an op naming a type this
    // theme does not implement must fail here with a reason, not at the server.
    // An unknown theme yields an EMPTY vocabulary, which fails every
    // section-type op with a clear reason — never a fallback to the union.
    knownSectionTypes: () => Object.keys(editorSectionTypeSchemas(editorThemeName())),
    knownBlockTypes: () => Object.keys(schemaStore.schemas),
    // Active schemas only, for CREATION: deprecated types keep rendering from
    // published snapshots (isBlockSchemaInsertable's contract) but must not be
    // born again — the create endpoint refuses them server-side too.
    insertableBlockTypes: () =>
      Object.values(schemaStore.schemas)
        .filter(schema => schema.status !== 'deprecated')
        .map(schema => schema.type),
    // Theme-scoped for the same reason as `knownSectionTypes` above: a layout
    // role exists because one of THIS theme's section types declares a slot for
    // it (L3).
    knownLayoutRoles: () => editorLayoutRoles(editorThemeName()),
    blockSettingIds: type =>
      schemaStore.schemas[type]?.settings?.map(setting => setting.id) ?? null,
    blockSettingFields: type =>
      (schemaStore.schemas[type]?.settings as readonly ValidatableField[] | undefined) ?? null,
    blockSettingField: (type, settingId) => {
      const field = schemaStore.schemas[type]?.settings?.find(setting => setting.id === settingId)
      if (!field) return null
      // `options` is a union in the schema type — range options, a select's
      // option array, or a free-form record. Only the record form carries
      // `valueMode`, so read it defensively rather than asserting the shape.
      const options = field.options
      const valueMode = options && !Array.isArray(options)
        ? (options as Record<string, unknown>).valueMode
        : undefined
      return {
        type: field.type,
        ...(typeof valueMode === 'string' ? { valueMode } : {}),
      }
    },
    // Theme-scoped like every other vocabulary member, and fail-CLOSED on a
    // theme this build does not ship: `getEditableSurface` derives from the
    // build's own globs, so an unknown theme yields no registry rather than
    // another theme's addresses.
    editableSurface: () => {
      const theme = editorThemeName()
      if (!theme) return null
      try {
        return getEditableSurface(theme)
      }
      catch (err) {
        if (import.meta.dev) console.warn('[assistant] no editable surface for theme', theme, err)
        return null
      }
    },
    layeredSectionTypes: () => layeredSectionTypes(getSectionTypeSchemasV2(editorThemeName())),

    // The library of the site the editor has open. An absent site id yields no
    // media at all, which refuses every attach with a stated reason — never a
    // fallback to some other site's library.
    lookupMedia: async (mediaId) => {
      const siteId = siteStore.activeSiteId
      if (!siteId) return null
      const record = await mediaLibraryStore.lookup(siteId, mediaId)
      return record
        ? { id: record.id, url: record.url, filename: record.filename, contentType: record.contentType }
        : null
    },

    // `sectionStore.error` is the ref that MOVES for section actions.
    // `editorStore.ownError` is this store's OWN channel: the exported `error`
    // is a computed aggregate (editorStore.ts:184) that answers null while
    // `changeStore.hasErrors` and lets a stale sectionStore message shadow the
    // action we just ran — both directions wrong for a post-condition sample.
    readSectionError: () => sectionStore.error,
    readEditorError: () => editorStore.ownError,

    createSection: (pageId, dto) => sectionStore.createSection(pageId, dto),
    createSectionFromPreset: (pageId, preset, name) => editorStore.createSectionFromPreset(pageId, preset, name),
    updateSection: (pageId, sectionId, dto) => sectionStore.updateSection(pageId, sectionId, dto),
    changeSectionType: (pageId, sectionId, nextType) => sectionStore.changeSectionType(pageId, sectionId, nextType),
    deleteSection: (pageId, sectionId) => sectionStore.deleteSection(pageId, sectionId),
    reorderSections: (pageId, orderedIds) => sectionStore.reorderSections(pageId, orderedIds),
    duplicateSection: (pageId, sectionId) => editorStore.duplicateSection(pageId, sectionId),

    addBlock: (type, position, presetSettings, sectionId, layoutRole) =>
      editorStore.addBlock(type, position, presetSettings, sectionId, layoutRole),
    flushBlockJob: flushBlock,
    // Every block on the page, because `moveBlockToSection` PUTs the whole live
    // block array: an unflushed optimistic draft on ANY block would be
    // persisted as though the author had saved it.
    flushPageBlockJobs: async () => {
      // Sequential, not Promise.all: concurrent drains on the same scope
      // contend for the change store's operation barrier, and a batch has no
      // deadline that would justify the race.
      for (const block of [...editorStore.blocks]) {
        if (!await flushBlock(block.id)) return false
      }
      return true
    },
    updateBlock: (blockId, settings) => editorStore.updateBlock(blockId, settings),
    updateBlockField: (blockId, fieldPath, value) => editorStore.updateBlockField(blockId, fieldPath, value),
    deleteBlock: blockId => editorStore.deleteBlock(blockId),
    blockPlacement: blockId => blockStore.getBlockPlacement(blockId),
    // Default history recording, exactly as a canvas drag: the batch runs inside
    // `withHistorySuppressed`, so the inner push is swallowed and the op folds
    // into the ONE batch snapshot instead of minting a second undo step.
    updateBlockPlacement: (blockId, placement) => blockStore.updateBlockPlacement(blockId, placement),
    reorderBlocks: order => editorStore.reorderBlocks(order),
    moveBlockToSection: (blockId, toSectionId, index, layoutRole) =>
      blockStore.moveBlockToSection(blockId, toSectionId, index, layoutRole),

    updatePageDetails: (pageId, patch) => editorStore.updatePageDetails(pageId, patch),
    updateThemeSettings: patch => editorStore.updateThemeSettings(patch),
    updateLayoutSettings: (layoutType, patch) => editorStore.updateLayoutSettings(layoutType, patch),

    typographyPresets: () => typographyAdmin.presets.value.map(p => ({ id: p.id, name: p.name })),
    // roleMap is exactly the shape saveRoles consumes (role → presetId | null),
    // derived from useTypographyAdmin's OWN `roles` ref — hence the separate
    // loaded signal below.
    typographyRoleMap: () => ({ ...typographyAdmin.roleMap.value }),
    // The composable's own load flag, NOT map emptiness: `roleMap` always
    // enumerates all 13 SYSTEM_ROLES (unmapped as null), so an emptiness test
    // would be dead code and the data-loss guard it feeds would never fire
    // (preflight S3).
    typographyRolesLoaded: () => typographyAdmin.rolesLoaded.value,
    refreshTypography: async () => {
      // `fetchPresets` / `fetchRoles` swallow their failures into the shared
      // `error` ref, so the VERDICT has to be read from it — the executor
      // refuses to merge roles into a map it cannot confirm was loaded. Both
      // fetches null the ref synchronously before their first await, so a
      // non-null value after `refresh()` means one of them genuinely failed.
      //
      // The verdict is ONE-DIRECTIONAL: false is proof of failure, true is not
      // proof that nothing failed. Every write path (`saveRoles`,
      // `updatePreset`, …) calls `refresh()` from its own catch, which nulls
      // the ref again on the way out — so a failed write followed by a
      // successful reload reads clean here. That is not a live bug: those paths
      // RETHROW, and the executor reports the throw. It matters only if a
      // caller ever treats `true` as "the last operation succeeded".
      await typographyAdmin.refresh()
      const loaded = typographyAdmin.error.value === null && typographyAdmin.rolesLoaded.value
      // The composable's refs are what roleMap and saveRoles read; the STORE
      // fetches are what make previewConfig recompute so the preview updates.
      // Both are required, and the store's own fetches never throw (they log
      // and reset), so they cannot falsify the verdict above.
      await Promise.all([
        typographyStore.fetchTypographyPresets(),
        typographyStore.fetchTypographyRoles(),
      ])
      return loaded
    },
    updateTypographyPreset: (presetId, dto) => typographyAdmin.updatePreset(presetId, dto),
    saveTypographyRoles: map => typographyAdmin.saveRoles(map),

    selectBlock: blockId => editorStore.selectBlock(blockId),
    selectSection: sectionId => editorStore.selectSection(sectionId),

    pushBlockHistory: () => blockStore.pushBlockHistory(),
    clearBlockHistory: () => blockStore.clearBlockHistory(),
    withHistorySuppressed: fn => blockStore.withHistorySuppressed(fn),
  }
}
