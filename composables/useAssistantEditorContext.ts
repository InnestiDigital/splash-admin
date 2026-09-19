import { onScopeDispose } from 'vue'
import { setEditorDigestProvider, clearEditorDigestProvider } from '~/admin/stores/assistantStore'
import { useAssistantEditorOpsStore } from '~/admin/stores/assistantEditorOpsStore'
import { useEditorStore } from '~/admin/stores/editorStore'
import { useSectionStore } from '~/admin/stores/sectionStore'
import { useSchemaStore } from '~/admin/stores/schemaStore'
import { useSelectionStore } from '~/admin/stores/selectionStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import { useTypographyStore } from '~/admin/stores/typographyStore'
// `admin/stores` is NOT in nuxt.config's auto-import dirs (only `admin/composables`
// is), so this import is load-bearing — without it the provider throws
// "useMediaLibraryStore is not defined" the first time a turn is composed.
import { useMediaLibraryStore, mediaKind } from '~/admin/stores/mediaLibraryStore'
import { getSectionTypeSchemas } from '~/shared/features/cms/sectionSchemas'
import {
  KNOWN_LAYOUT_ROLES,
  SECTION_COLOR_SCHEMES,
  SECTION_CONTAINER_MODES,
} from '~/shared/types/sectionTypes'
import { SPLASH_SECTION_PRESENTATION_FIELDS } from '~/admin/lib/protocol/types/splash-editor-ops'
import { SYSTEM_ROLES } from '~/server/services/typography/typographyTypes'
import { getLocalizedLabel, getSchemaLabel } from '~/admin/utils/labelUtils'
import type { Block, Section } from '~/server/storage/types'
import type { SectionTypeSchema } from '~/shared/types/sectionTypes'
import type { EditorMode } from '~/admin/stores/selectionStore'
import type {
  SplashEditorContext,
  SplashEditorMedia,
  SplashEditorOpsReport,
  SplashEditorOutlineBlock,
  SplashEditorOutlineSection,
  SplashEditorSelection,
} from '~/admin/lib/protocol/types/splash-editor-context'
import { MAX_EDITOR_MEDIA_ITEMS } from '~/admin/lib/protocol/types/splash-editor-context'
// Roughly 5-20 KB of extra prompt on every editor turn is the accepted cost;
// the protocol constant bounds the tail. It is imported, never redeclared: the
// runtime enforces the same budget, and two copies would drift (preflight C7).
// Block SETTING vocabulary is excluded from the digest entirely — the model has
// `list_block_schemas` and settings would dwarf everything else (spec §3.3).
import { MAX_EDITOR_DIGEST_BYTES } from '~/admin/lib/protocol/types/splash-editor-context'

const MAX_LABEL = 80
const MAX_PATH = 200
/** Setting ids a block may carry a human-meaningful name under, in priority order. */
const LABEL_KEYS = ['title', 'heading', 'label'] as const

export interface EditorDigestInput {
  editorMounted: boolean
  editorMode: EditorMode
  activeSectionId: string | null
  page: { id: string, label: string, path?: string } | null
  sections: readonly Section[]
  blocks: readonly Block[]
  theme: string
  sectionTypeSchemas: Record<string, SectionTypeSchema>
  blockTypes: readonly { type: string, label: string, settings?: readonly string[] }[]
  layoutRoles: readonly string[]
  colorSchemes: readonly string[]
  containerModes: readonly string[]
  presentationFields: readonly string[]
  typographyPresets: readonly string[]
  typographyRoles: readonly string[]
  /**
   * The site's media library, or null when it is not loaded. Null and an empty
   * list are NOT the same claim and the digest keeps them apart: an empty list
   * tells the model the operator has uploaded nothing, and saying that about a
   * library that merely failed to load sends it to invent a URL instead.
   */
  media: { items: readonly MediaInventoryItem[], total: number } | null
  lastOpsReport: SplashEditorOpsReport | null
}

/** One media row as the digest builder receives it — the store's shape, narrowed. */
export interface MediaInventoryItem {
  id: string
  filename: string
  contentType: string
}

/**
 * Slices on Unicode code points, not UTF-16 code units — a naive `.slice()` can
 * land inside a surrogate pair and emit a lone surrogate, which the model is
 * then asked to quote back verbatim (and which `TextEncoder` mangles on the wire).
 */
function clamp(value: string, max = MAX_LABEL): string {
  const codePoints = Array.from(value)
  return codePoints.length > max ? codePoints.slice(0, max).join('') : value
}

/**
 * Every label the digest emits is `min(1)` in the protocol schema, so an empty
 * authored name must fall back rather than invalidate the whole digest.
 */
function label(value: string | null | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim()
  return clamp(trimmed || fallback)
}

/**
 * A name the model can quote back verbatim in `by: 'label'`. Falls back to
 * "<type> #<n>" so every outline entry is addressable — an unnamed block the
 * model cannot reference is a block it will try to invent an id for.
 */
export function blockLabel(block: Block, indexInSection: number): string {
  const settings: Record<string, unknown> = block.settings ?? {}
  for (const key of LABEL_KEYS) {
    const candidate = settings[key]
    if (typeof candidate === 'string' && candidate.trim()) return clamp(candidate.trim())
  }
  return clamp(`${block.type} #${indexInSection + 1}`)
}

function outlineBlock(block: Block, indexInSection: number): SplashEditorOutlineBlock {
  return {
    id: block.id,
    type: clamp(block.type),
    label: blockLabel(block, indexInSection),
    ...(block.layoutRole ? { layoutRole: clamp(block.layoutRole, 60) } : {}),
  }
}

function buildSelection(
  input: EditorDigestInput,
  page: { id: string, label: string, path?: string },
): SplashEditorSelection {
  const base = {
    pageId: page.id,
    pageLabel: label(page.label, page.id),
    ...(page.path ? { pagePath: clamp(page.path, MAX_PATH) } : {}),
    ...(input.activeSectionId ? { activeSectionId: input.activeSectionId } : {}),
  }
  const mode = input.editorMode
  switch (mode.type) {
    case 'block': {
      const block = input.blocks.find(b => b.id === mode.blockId)
      const section = block?.sectionId
        ? input.sections.find(s => s.id === block.sectionId)
        : undefined
      return {
        ...base,
        mode: 'block',
        blockId: mode.blockId,
        ...(block ? { blockType: clamp(block.type) } : {}),
        ...(section ? { sectionId: section.id, sectionLabel: label(section.name, section.id) } : {}),
      }
    }
    case 'section': {
      const section = input.sections.find(s => s.id === mode.sectionId)
      return {
        ...base,
        mode: 'section',
        sectionId: mode.sectionId,
        ...(section ? { sectionLabel: label(section.name, section.id) } : {}),
      }
    }
    case 'layout':
      // `layoutType` is a plain string in the store; the protocol enum is
      // header|footer. An unknown value must cost the key, not the digest.
      return {
        ...base,
        mode: 'layout',
        ...(mode.layoutType === 'header' || mode.layoutType === 'footer'
          ? { layoutType: mode.layoutType }
          : {}),
      }
    case 'theme-settings':
      return { ...base, mode: 'theme-settings' }
    case 'page-settings':
      return { ...base, mode: 'page-settings' }
    case 'none':
      return { ...base, mode: 'none' }
    default: {
      const exhaustive: never = mode
      return exhaustive
    }
  }
}

function buildOutline(input: EditorDigestInput): {
  outline: SplashEditorOutlineSection[]
  unsectioned: SplashEditorOutlineBlock[]
} {
  // Blocks are grouped in STORE ARRAY ORDER, never sorted by `position`.
  //
  // Not merely a fidelity choice — the array is what the editor renders, so it
  // is the descriptive truth for an outline meant to mirror what the operator
  // sees, and `position` goes stale within a batch (`removeBlockFromState`
  // filters without renumbering; a null-position create pushes). But the
  // deciding reason is that this outline is the REFERENT for two model-supplied
  // values the executor resolves against array order:
  //
  //   - `by: 'label'`. The `"<type> #<n>"` fallback embeds a per-section
  //     ordinal counted right here. On a page whose array is [C2, D3, E4, N3],
  //     a position-sorted grouping shows C#1 D#2 N#3 E#4 while the host sees
  //     C#1 D#2 E#3 N#4 — so the model asking for "#3" meaning N resolves
  //     UNIQUELY to E. Both labels exist and neither is ambiguous, so nothing
  //     fails; the wrong block is simply edited.
  //   - `indexInSection`, resolved through `orderedBlocks` (applyEditorOp.ts).
  //     "Third in this section" must count the same sequence the model read.
  //
  // Sections keep their position sort below: they carry no array-order
  // semantics, and the executor sorts them by position too.
  const grouped = new Map<string, Block[]>()
  const loose: Block[] = []
  for (const block of input.blocks) {
    if (!block.sectionId) {
      loose.push(block)
      continue
    }
    const bucket = grouped.get(block.sectionId)
    if (bucket) bucket.push(block)
    else grouped.set(block.sectionId, [block])
  }

  const outline = [...input.sections]
    .sort((a, b) => a.position - b.position)
    .map<SplashEditorOutlineSection>(section => ({
      id: section.id,
      label: label(section.name, section.id),
      ...(section.sectionType ? { sectionType: clamp(section.sectionType, 60) } : {}),
      ...(section.colorScheme ? { colorScheme: clamp(section.colorScheme, 40) } : {}),
      ...(section.containerMode ? { containerMode: clamp(section.containerMode, 40) } : {}),
      ...(section.isHidden ? { hidden: true } : {}),
      blocks: (grouped.get(section.id) ?? []).map(outlineBlock),
    }))

  return { outline, unsectioned: loose.map(outlineBlock) }
}

const KEEP_BLOCKS_PER_SECTION = 5
const KEEP_SECTIONS = 30
/** What survives of the media inventory once the digest is over budget. */
const KEEP_MEDIA_ITEMS = 20

/**
 * The library, capped and narrowed to what the model needs to choose an id.
 *
 * `total` rather than `items.length` drives `omitted`: the store holds one
 * page, so a site with 400 assets reports the 300 it never fetched as omitted
 * too. Under-reporting there would tell the model it has seen everything.
 */
function buildMedia(
  media: { items: readonly MediaInventoryItem[], total: number },
): SplashEditorMedia {
  const items = media.items.slice(0, MAX_EDITOR_MEDIA_ITEMS).map(item => ({
    id: item.id,
    filename: label(item.filename, item.id),
    // The store's classifier, not a second copy: the digest and any future
    // consumer must not be able to disagree about what an asset IS.
    kind: mediaKind(item.contentType),
  }))
  const omitted = Math.max(0, media.total - items.length)
  return { items, ...(omitted > 0 ? { omitted } : {}) }
}

/**
 * Media is trimmed AFTER the outline and the block-type vocabulary: an author
 * who cannot be told which blocks exist is worse off than one whose assistant
 * has to ask which image they meant. The key is kept — never dropped whole —
 * because its absence means "not loaded", and a model told that will write a
 * URL rather than ask.
 */
function trimMedia(digest: SplashEditorContext): SplashEditorContext {
  const media = digest.media
  if (!media || media.items.length <= KEEP_MEDIA_ITEMS) return digest
  const dropped = media.items.length - KEEP_MEDIA_ITEMS
  return {
    ...digest,
    media: {
      items: media.items.slice(0, KEEP_MEDIA_ITEMS),
      omitted: (media.omitted ?? 0) + dropped,
    },
  }
}

// `SplashEditorContextSchema`'s array ceilings (protocol source of truth). A page
// can stay well under `MAX_EDITOR_DIGEST_BYTES` while still exceeding one of these
// counts — many tiny sections, a long vocabulary list — so they are enforced
// unconditionally, independent of the byte-driven degradation ladder below.
const MAX_OUTLINE_SECTIONS = 60
const MAX_BLOCKS_PER_SECTION = 40
const MAX_UNSECTIONED_BLOCKS = 40
const MAX_SECTION_TYPES = 12
const MAX_SLOTS_PER_SECTION_TYPE = 12
const MAX_BLOCK_TYPES = 160
const MAX_LAYOUT_ROLES = 20
const MAX_COLOR_SCHEMES = 12
const MAX_CONTAINER_MODES = 12
const MAX_PRESENTATION_FIELDS = 20
const MAX_TYPOGRAPHY_PRESETS = 60
const MAX_TYPOGRAPHY_ROLES = 20

function digestBytes(digest: SplashEditorContext): number {
  return new TextEncoder().encode(JSON.stringify(digest)).length
}

/** The section the operator is looking at is never trimmed. */
function selectedSectionId(selection: SplashEditorSelection): string | null {
  return selection.sectionId ?? selection.activeSectionId ?? null
}

function trimBlocks(digest: SplashEditorContext): SplashEditorContext {
  const keep = selectedSectionId(digest.selection)
  return {
    ...digest,
    outline: digest.outline.map((section) => {
      if (section.id === keep || section.blocks.length <= KEEP_BLOCKS_PER_SECTION) return section
      return {
        ...section,
        blocks: section.blocks.slice(0, KEEP_BLOCKS_PER_SECTION),
        blocksOmitted: section.blocks.length - KEEP_BLOCKS_PER_SECTION,
      }
    }),
  }
}

function trimSections(digest: SplashEditorContext): SplashEditorContext {
  if (digest.outline.length <= KEEP_SECTIONS) return digest
  const keep = selectedSectionId(digest.selection)
  const head = digest.outline.slice(0, KEEP_SECTIONS)
  const selected = keep && !head.some(s => s.id === keep)
    ? digest.outline.find(s => s.id === keep)
    : undefined
  const outline = selected ? [...head, selected] : head
  return {
    ...digest,
    outline,
    outlineOmitted: digest.outline.length - outline.length,
  }
}

function narrowBlockTypes(
  digest: SplashEditorContext,
  preTrimTypes: ReadonlySet<string>,
): SplashEditorContext {
  return {
    ...digest,
    vocabulary: {
      ...digest.vocabulary,
      blockTypes: digest.vocabulary.blockTypes.filter(b => preTrimTypes.has(b.type)),
    },
  }
}

/**
 * Hard schema-array-count ceiling. Runs unconditionally, before the byte-driven
 * ladder gets a chance to short-circuit on a digest that is small enough in bytes
 * but still exceeds one of `SplashEditorContextSchema`'s `.max(N)` array bounds —
 * every array in the wire shape is capped, so violating any one fails strict parse
 * regardless of overall size.
 */
function capArrayMaxima(digest: SplashEditorContext): SplashEditorContext {
  const keep = selectedSectionId(digest.selection)

  const blocksCapped = digest.outline.map((section) => {
    if (section.blocks.length <= MAX_BLOCKS_PER_SECTION) return section
    return {
      ...section,
      blocks: section.blocks.slice(0, MAX_BLOCKS_PER_SECTION),
      blocksOmitted: (section.blocksOmitted ?? 0) + (section.blocks.length - MAX_BLOCKS_PER_SECTION),
    }
  })

  let outline = blocksCapped
  let outlineOmitted = digest.outlineOmitted
  if (blocksCapped.length > MAX_OUTLINE_SECTIONS) {
    const head = blocksCapped.slice(0, MAX_OUTLINE_SECTIONS)
    const selected = keep && !head.some(s => s.id === keep)
      ? blocksCapped.find(s => s.id === keep)
      : undefined
    // Unlike trimSections' KEEP_SECTIONS+selected (31 <= the real max of 60, so an extra
    // slot is affordable), this cap targets the schema's actual ceiling — there is no
    // room to append a 61st entry, so the selected section replaces the head's last slot.
    outline = selected ? [...head.slice(0, MAX_OUTLINE_SECTIONS - 1), selected] : head
    outlineOmitted = (outlineOmitted ?? 0) + (blocksCapped.length - outline.length)
  }

  return {
    ...digest,
    outline,
    ...(outlineOmitted !== undefined ? { outlineOmitted } : {}),
    ...(digest.unsectioned ? { unsectioned: digest.unsectioned.slice(0, MAX_UNSECTIONED_BLOCKS) } : {}),
    ...(digest.media
      ? {
          media: {
            items: digest.media.items.slice(0, MAX_EDITOR_MEDIA_ITEMS),
            ...(digest.media.omitted !== undefined ? { omitted: digest.media.omitted } : {}),
          },
        }
      : {}),
    vocabulary: {
      ...digest.vocabulary,
      sectionTypes: digest.vocabulary.sectionTypes.slice(0, MAX_SECTION_TYPES).map(sectionType => ({
        ...sectionType,
        slots: sectionType.slots.slice(0, MAX_SLOTS_PER_SECTION_TYPE),
      })),
      blockTypes: digest.vocabulary.blockTypes.slice(0, MAX_BLOCK_TYPES),
      layoutRoles: digest.vocabulary.layoutRoles.slice(0, MAX_LAYOUT_ROLES),
      colorSchemes: digest.vocabulary.colorSchemes.slice(0, MAX_COLOR_SCHEMES),
      containerModes: digest.vocabulary.containerModes.slice(0, MAX_CONTAINER_MODES),
      presentationFields: digest.vocabulary.presentationFields.slice(0, MAX_PRESENTATION_FIELDS),
      typographyPresets: digest.vocabulary.typographyPresets.slice(0, MAX_TYPOGRAPHY_PRESETS),
      typographyRoles: digest.vocabulary.typographyRoles.slice(0, MAX_TYPOGRAPHY_ROLES),
    },
  }
}

/**
 * Terminal clamp [R14]. Keeps the minimum that still lets the model act
 * safely — who is selected, and the closed vocabularies it must quote
 * verbatim — and says so with `degraded: true` so the prompt rail can tell it
 * to ask rather than assume. Never returns undefined: a missing digest would
 * flip the write-path decision.
 */
function clampDigest(digest: SplashEditorContext): SplashEditorContext {
  return {
    selection: digest.selection,
    outline: [],
    vocabulary: {
      theme: digest.vocabulary.theme,
      sectionTypes: digest.vocabulary.sectionTypes,
      blockTypes: [],
      layoutRoles: digest.vocabulary.layoutRoles,
      colorSchemes: digest.vocabulary.colorSchemes,
      containerModes: digest.vocabulary.containerModes,
      presentationFields: digest.vocabulary.presentationFields,
      typographyPresets: [],
      typographyRoles: digest.vocabulary.typographyRoles,
    },
    // The inventory does not survive the terminal clamp, but the KEY does when
    // it was loaded: an empty list still says "this library holds nothing you
    // can see from here", which is the honest statement at this point and
    // stops the model writing a URL it invented.
    ...(digest.media ? { media: { items: [], omitted: digest.media.items.length + (digest.media.omitted ?? 0) } } : {}),
    degraded: true,
    ...(digest.lastOpsReport ? { lastOpsReport: digest.lastOpsReport } : {}),
  }
}

/**
 * Advisory editor digest (spec §3). Pure: every source is passed in, so the
 * whole projection unit-tests without mounting the editor.
 *
 * Returns undefined ONLY when there is no editor to describe — the mounted
 * flag is false, or no page is open. Every other shortfall degrades the
 * CONTENT of the digest (Task 5), never its presence: an absent `editor` key
 * flips the model onto the API write path while the operator watches a live
 * preview [R14].
 */
export function buildEditorDigest(input: EditorDigestInput): SplashEditorContext | undefined {
  if (!input.editorMounted || !input.page) return undefined

  const { outline, unsectioned } = buildOutline(input)
  let digest: SplashEditorContext = {
    selection: buildSelection(input, input.page),
    outline,
    ...(unsectioned.length > 0 ? { unsectioned } : {}),
    vocabulary: {
      theme: clamp(input.theme),
      sectionTypes: Object.values(input.sectionTypeSchemas).map(schema => ({
        type: clamp(schema.type, 60),
        label: label(schema.label, schema.type),
        // The schema names its slot list `layoutSlots`; the wire shape is `slots`.
        slots: (schema.layoutSlots ?? []).map(slot => ({
          role: slot.role,
          required: slot.required ?? false,
          multiple: slot.multiple ?? false,
        })),
      })),
      // `label()` guards the schema's `min(1)` on `label`; a block type with both
      // `type` and `label` blank would otherwise emit an empty string and fail
      // strict parse, dropping the whole digest [R14].
      blockTypes: input.blockTypes.map((b, i) => ({
        type: clamp(b.type),
        label: label(b.label, b.type || `Block type #${i + 1}`),
        // Ids only, capped: the option vocabularies stay runtime-side so this
        // cannot dwarf the 24 KB budget. Dropped entirely by the terminal
        // clamp along with blockTypes when degradation reaches the floor.
        ...(b.settings && b.settings.length > 0
          ? { settings: b.settings.slice(0, 16).map(id => clamp(id, 60)) }
          : {}),
      })),
      layoutRoles: [...input.layoutRoles],
      colorSchemes: [...input.colorSchemes],
      containerModes: [...input.containerModes],
      presentationFields: [...input.presentationFields],
      // Same guard as blockTypes: `typographyPresets` is `shortLabel` (`min(1)`),
      // so a blank preset name needs a fallback, not a bare `clamp()`.
      typographyPresets: input.typographyPresets.map((p, i) => label(p, `Typography preset #${i + 1}`)),
      typographyRoles: [...input.typographyRoles],
    },
    ...(input.media ? { media: buildMedia(input.media) } : {}),
    ...(input.lastOpsReport ? { lastOpsReport: input.lastOpsReport } : {}),
  }

  // Schema array-count safety net first — independent of byte size (see
  // `capArrayMaxima`'s doc comment).
  digest = capArrayMaxima(digest)

  if (digestBytes(digest) <= MAX_EDITOR_DIGEST_BYTES) return digest

  // Types present BEFORE any trimming — computing this against the trimmed
  // outline would hide exactly the types the model needs to reason about what
  // was trimmed [R14].
  const preTrimTypes = new Set([
    ...outline.flatMap(s => s.blocks.map(b => b.type)),
    ...unsectioned.map(b => b.type),
  ])

  digest = trimBlocks(digest)
  if (digestBytes(digest) <= MAX_EDITOR_DIGEST_BYTES) return digest

  digest = trimSections(digest)
  if (digestBytes(digest) <= MAX_EDITOR_DIGEST_BYTES) return digest

  digest = narrowBlockTypes(digest, preTrimTypes)
  if (digestBytes(digest) <= MAX_EDITOR_DIGEST_BYTES) return digest

  digest = trimMedia(digest)
  if (digestBytes(digest) <= MAX_EDITOR_DIGEST_BYTES) return digest

  return clampDigest(digest)
}

/**
 * The theme whose section-type vocabulary the editor VALIDATES against —
 * character for character the expression `sectionStore.changeSectionType` uses
 * (sectionStore.ts:297), fallback included.
 *
 * Deliberately not `themeManifest?.name`: when `activeSiteTheme` is empty the
 * store still validates against `standalone`, so a manifest-derived answer
 * would advertise one theme's section types while the very next store call
 * rejected them against another's — the exact mismatch this function exists to
 * prevent. If the fallback ever moves, it moves in both places.
 */
export function editorThemeName(): string {
  return useSiteStore().activeSiteTheme || 'standalone'
}

/**
 * Section-type schemas for `theme`, fail-CLOSED. `getSectionTypeSchemas` THROWS
 * on a theme the build's glob does not know, and a site row can name a theme
 * this build does not ship. An empty vocabulary costs the model its section-type
 * ops with a stated reason; a throw would cost the whole digest, or the whole
 * batch, for the same cause.
 */
export function editorSectionTypeSchemas(theme: string): Record<string, SectionTypeSchema> {
  if (!theme) return {}
  try {
    return getSectionTypeSchemas(theme)
  } catch (err) {
    if (import.meta.dev) console.warn('[assistant] unknown theme for section-type vocabulary', theme, err)
    return {}
  }
}

/**
 * Every layout role the theme's own section types declare (L3).
 *
 * Theme-scoped for the same reason the section types are: a role exists because
 * some section type declares a slot for it, so a theme that adds a section type
 * adds its roles with it. Falls back to the builtin seed only when the theme
 * ships no section-type schemas at all — the same shape `sectionTypeCatalog`
 * uses server-side, so the advertised vocabulary and the enforced one agree.
 */
export function editorLayoutRoles(theme: string): readonly string[] {
  const roles = new Set<string>()
  for (const schema of Object.values(editorSectionTypeSchemas(theme))) {
    for (const slot of schema.layoutSlots ?? []) {
      if (slot?.role) roles.add(slot.role)
    }
  }
  return roles.size > 0 ? [...roles] : [...KNOWN_LAYOUT_ROLES]
}

/**
 * Register the store-reading digest provider with assistantStore. Call once
 * from the drawer alongside useAssistantEditorOps; the provider runs per turn,
 * so there is no cache and no staleness.
 *
 * The `editorMounted` gate is the whole point of routing through the ops store:
 * editor stores SURVIVE navigation away from the editor, so `currentPage` alone
 * would keep advertising a live editor from the admin shell and invite the
 * model to send ops nothing can apply (spec §5.2).
 */
export function useAssistantEditorContext(): void {
  const opsStore = useAssistantEditorOpsStore()
  const editorStore = useEditorStore()
  const sectionStore = useSectionStore()
  const schemaStore = useSchemaStore()
  const selectionStore = useSelectionStore()
  const typographyStore = useTypographyStore()
  const siteStore = useSiteStore()
  const mediaLibraryStore = useMediaLibraryStore()

  const provider = (): SplashEditorContext | undefined => {
    const page = editorStore.currentPage
    const theme = editorThemeName()
    const locale = schemaStore.editingLocale
    const siteId = siteStore.activeSiteId
    // Fire-and-forget: the provider is SYNCHRONOUS, so this turn reads whatever
    // is already cached and the fetch it may start lands for the next one. The
    // store's TTL makes this a no-op on most turns, and its error is swallowed
    // into a ref — a library that will not load costs the inventory, never the
    // digest.
    if (siteId) void mediaLibraryStore.ensureLoaded(siteId)
    return buildEditorDigest({
      editorMounted: opsStore.editorMounted,
      editorMode: selectionStore.editorMode,
      activeSectionId: sectionStore.activeSectionId,
      // `title` and a block schema's `label` are LOCALE MAPS, not strings.
      // Passing the raw map would stringify an object into a name the model is
      // then asked to quote back verbatim.
      page: page
        ? {
            id: page.id,
            label: getLocalizedLabel(page.title, locale) || page.slug || 'Untitled page',
            path: page.slug,
          }
        : null,
      sections: sectionStore.sections,
      blocks: editorStore.blocks,
      theme,
      sectionTypeSchemas: editorSectionTypeSchemas(theme),
      blockTypes: Object.values(schemaStore.schemas).map(s => ({
        type: s.type,
        label: getSchemaLabel(s, locale),
        settings: (s.settings ?? []).map(setting => setting.id),
      })),
      layoutRoles: editorLayoutRoles(theme),
      colorSchemes: SECTION_COLOR_SCHEMES,
      containerModes: SECTION_CONTAINER_MODES,
      presentationFields: SPLASH_SECTION_PRESENTATION_FIELDS,
      typographyPresets: typographyStore.typographyPresets.map(p => p.name),
      typographyRoles: SYSTEM_ROLES,
      // Gated on `isLoadedFor(siteId)`, not on the array being non-empty: an
      // unloaded store and a site with no uploads both hold an empty `items`,
      // and publishing the second shape for the first would tell the model the
      // operator has uploaded nothing. Null says "unknown" instead.
      media: siteId && mediaLibraryStore.isLoadedFor(siteId)
        ? { items: mediaLibraryStore.items, total: mediaLibraryStore.total }
        : null,
      // At-most-once: the report rides the NEXT turn's digest and then stops,
      // so the model is not re-told about a batch it has already answered.
      lastOpsReport: opsStore.consumeReport(),
    })
  }

  setEditorDigestProvider(provider)
  onScopeDispose(() => clearEditorDigestProvider(provider))
}
