<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue'
import { useEditorStore } from '~/admin/stores/editorStore'
import {
  editorChangeKey,
  editorChangeScope,
  useEditorChangeStore,
} from '~/admin/stores/editorChangeStore'
import { useSectionStore } from '~/admin/stores/sectionStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import { getSectionTypeSchema, getSectionTypeSchemas, getSectionTypeSchemaV2 } from '~/shared/features/cms/sectionSchemas'
import type { SectionType, SectionTypeSchema, LayoutSlot } from '~/shared/types/sectionTypes'
import type { Block, BlockSchema } from '~/server/storage/types'
import VisualOptionGroup from './VisualOptionGroup.vue'
import SectionLayoutDiagram from './SectionLayoutDiagram.vue'
import { sectionTypeIcon, settingIcons } from './sectionTypeIcons'
import { groupBlocksByCategory, formatCategoryLabel, resolveDescription } from '~/admin/utils/blockPickerUtils'
import type { BlockPickerGroup } from '~/admin/utils/blockPickerUtils'
import { getBlockRoleContext } from '~/admin/utils/blockRoleContext'
import type { BlockRoleContext } from '~/admin/utils/blockRoleContext'
import { entrancePresets } from '~/shared/features/cms/animation/presets/index'
import type { ChoreographyMode, ChoreographyOrder } from '~/shared/types/animation'
import { DEFAULT_CHOREOGRAPHY } from '~/shared/types/animation'
import { isCanvasInsetMismatch } from '~/shared/features/layout/canvasPresets'
import { LAYOUT_CONTAINER_MODE_OPTIONS, LAYOUT_SPACING_TIER_OPTIONS } from '~/shared/types/layout'
import { getThemeConfig } from '~/shared/features/cms/themeData'
import {
  WIDTH_HINT_KINDS,
  crossScopeWidthHint,
  type WidthHintKind,
} from '~/shared/features/layout/widthHints'

const editor = useEditorStore()
const changes = useEditorChangeStore()
const sectionStore = useSectionStore()
const siteStore = useSiteStore()

const section = computed(() => editor.selectedSection)
const themeName = computed(() => siteStore.activeSiteTheme || 'standalone')

// Canvas-scoped deliberately: full-bleed + inset is legitimate on site pages
// (edge-to-edge background, padded content); on a canvas it almost always
// means the author wanted the sheet's edges and got a margin instead.
const isCanvasPage = computed(() => (editor.currentPage as any)?.pageType === 'brand-canvas')
const showCanvasInsetWarning = computed(() =>
  isCanvasPage.value && isCanvasInsetMismatch(localContainerMode.value, localContainerInsetX.value),
)

// Reciprocal half of the block-side hint in PlacementPanel: the section owns
// the container, each block owns its own cap, and the same predicate decides
// which of the two combinations is worth explaining.
function widthHintText(kind: Exclude<WidthHintKind, 'none'>): string {
  switch (kind) {
    case 'constrained-in-full-bleed':
      return 'This section is Full Width, but blocks inside it keep their own width constraint — each block’s Width setting decides how far it stretches.'
    case 'full-in-narrow':
      return 'Blocks inside this section are set to Full Width — in a Narrow section they fill the 720px container, not the browser window.'
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}

const crossScopeWidthHints = computed(() => {
  const present = new Set<WidthHintKind>()
  for (const block of sectionBlocksList.value) {
    present.add(crossScopeWidthHint(localContainerMode.value, block.placement?.widthMode, block.placement?.maxWidth))
  }
  return WIDTH_HINT_KINDS
    .filter((kind): kind is Exclude<WidthHintKind, 'none'> => kind !== 'none' && present.has(kind))
    .map(widthHintText)
})

// --- Local state ---
const localName = ref('')
const localAnchor = ref('')
const localColorScheme = ref('light')
const localSectionRole = ref('')
const localSectionType = ref<SectionType>('stacked')
const localContainerMode = ref('measure')
const localSectionSpaceY = ref('md')
const localContainerInsetX = ref('md')
const localIsHidden = ref(false)
const localRevealPreset = ref('')
const localDefaultBlockEntrance = ref('')
const localChoreographyMode = ref<ChoreographyMode>('none')
const localChoreographyBaseDelay = ref<number>(DEFAULT_CHOREOGRAPHY.baseDelay)
const localChoreographyOrder = ref<ChoreographyOrder>(DEFAULT_CHOREOGRAPHY.order)
const localLayoutConfig = reactive<Record<string, any>>({})

// --- Computed: schemas ---
const availableTypes = computed(() => {
  try {
    const schemas = getSectionTypeSchemas(themeName.value)
    return Object.values(schemas)
  } catch {
    return []
  }
})

const typeSchema = computed<SectionTypeSchema | undefined>(() => {
  try {
    return getSectionTypeSchema(themeName.value, localSectionType.value)
  } catch {
    return undefined
  }
})

const hasLayoutSlots = computed(() =>
  (typeSchema.value?.layoutSlots?.length ?? 0) > 0,
)

// Curated arrangement presets from the type's .v2.json (C2). Rendered as a
// card grid; the authored choice persists in layoutConfig.layoutPreset.
const sectionPresets = computed(() => {
  try {
    return getSectionTypeSchemaV2(themeName.value, localSectionType.value)?.presets ?? []
  } catch {
    return []
  }
})

function presetLabel(preset: { label: string | Record<string, string> }): string {
  if (typeof preset.label === 'string') return preset.label
  return preset.label['en-US'] ?? Object.values(preset.label)[0] ?? preset.id
}

function presetDescription(preset: { description?: string | Record<string, string> }): string {
  if (!preset.description) return ''
  if (typeof preset.description === 'string') return preset.description
  return preset.description['en-US'] ?? Object.values(preset.description)[0] ?? ''
}

function seedLocalState(s: NonNullable<typeof section.value>) {
  localName.value = s.name
  localAnchor.value = s.anchor || ''
  // DB schema defaults (sections.color_scheme/container_mode are NOT NULL with
  // defaults) don't reach in-memory fixtures — fall back to the same values.
  localColorScheme.value = s.colorScheme || 'light'
  localSectionRole.value = s.sectionRole || ''
  localSectionType.value = (s as any).sectionType || 'stacked'
  localContainerMode.value = s.containerMode || 'measure'
  localSectionSpaceY.value = (s as any).sectionSpaceY || 'md'
  localContainerInsetX.value = (s as any).containerInsetX || (s.containerMode === 'full-bleed' ? 'none' : 'md')
  localIsHidden.value = s.isHidden
  localRevealPreset.value = s.revealPreset || ''
  localDefaultBlockEntrance.value = s.defaultBlockEntrance || ''

  // Sync choreographyMeta — `none` mode is the default no-op
  const chore = (s as any).choreographyMeta ?? null
  localChoreographyMode.value = chore?.mode ?? 'none'
  localChoreographyBaseDelay.value = chore?.baseDelay ?? DEFAULT_CHOREOGRAPHY.baseDelay
  localChoreographyOrder.value = chore?.order ?? DEFAULT_CHOREOGRAPHY.order

  // Sync layoutConfig
  const cfg = (s as any).layoutConfig || {}
  Object.keys(localLayoutConfig).forEach(k => delete localLayoutConfig[k])
  Object.assign(localLayoutConfig, cfg)

  // Ensure custom color defaults exist
  if (!localLayoutConfig.customBgColor) localLayoutConfig.customBgColor = '#ffffff'
  if (!localLayoutConfig.customTextColor) localLayoutConfig.customTextColor = '#222222'
  if (!localLayoutConfig.customAccentColor) localLayoutConfig.customAccentColor = ''
  if (!localLayoutConfig.customBorderColor) localLayoutConfig.customBorderColor = ''

  // Apply schema defaults for missing keys
  const schema = getSectionTypeSchema(themeName.value, localSectionType.value)
  if (schema) {
    for (const setting of schema.settings) {
      if (!(setting.id in localLayoutConfig) && setting.default !== undefined) {
        localLayoutConfig[setting.id] = setting.default
      }
    }
  }
}

// --- Sync local state from section ---
//
// Selection normally goes through editorStore's inspector guard. Keep this
// local identity boundary as well: SectionSettings can also be reused outside
// that shell, and an old draft must be flushed before its local refs are
// repurposed for another section.
let sectionSyncRevision = 0
watch(section, async (s, previousSection) => {
  const revision = ++sectionSyncRevision
  const identityChanged = previousSection
    && (!s || previousSection.id !== s.id || previousSection.pageId !== s.pageId)

  if (identityChanged) {
    const previousKey = editorChangeKey.section(previousSection.pageId, previousSection.id)
    const saved = await changes.flushJob(previousKey, true)
    if (!saved || revision !== sectionSyncRevision) return
  }

  if (!s || revision !== sectionSyncRevision) return

  // A section response replaces the object in sectionStore. While this job is
  // still dirty/saving, that response may represent an older revision; never
  // let it overwrite the newer inspector draft.
  const activeJob = changes.getJob(editorChangeKey.section(s.pageId, s.id))
  if (!identityChanged && (activeJob?.dirty || activeJob?.saving)) return

  seedLocalState(s)
}, { immediate: true })

// --- Save ---
type SectionSavePayload = Record<string, any>

const latestDrafts = new Map<string, SectionSavePayload>()

function immutablePayload<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function buildSavePayload(): SectionSavePayload {
  // `none` mode persists as null so the resolver short-circuits cleanly.
  const choreographyMeta = localChoreographyMode.value === 'none'
    ? null
    : {
        mode: localChoreographyMode.value,
        baseDelay: clampBaseDelay(localChoreographyBaseDelay.value),
        order: localChoreographyOrder.value,
      }

  return immutablePayload({
    name: localName.value,
    anchor: localAnchor.value || null,
    colorScheme: localColorScheme.value,
    sectionRole: localSectionRole.value || null,
    sectionType: localSectionType.value,
    containerMode: localContainerMode.value,
    sectionSpaceY: localSectionSpaceY.value,
    containerInsetX: localContainerInsetX.value,
    isHidden: localIsHidden.value,
    revealPreset: localRevealPreset.value || null,
    defaultBlockEntrance: localDefaultBlockEntrance.value || null,
    choreographyMeta,
    layoutConfig: { ...localLayoutConfig },
  })
}

/**
 * Put the latest queued revision back into the shared section state after an
 * older response arrives. This keeps both the inspector and preview on the
 * newest draft while the coordinator serializes the next request.
 */
function restoreNewerDraft(sectionId: string, payload: SectionSavePayload): void {
  sectionStore.patchSectionInState(sectionId, immutablePayload(payload))
}

function queueSave(delay?: number): string | null {
  const currentSection = section.value
  const currentPage = editor.currentPage
  if (!currentSection || !currentPage) return null

  const pageId = currentSection.pageId || currentPage.id
  const sectionId = currentSection.id
  const siteId = currentSection.siteId || editor.siteId
  if (!siteId) return null
  const key = editorChangeKey.section(pageId, sectionId)
  const payload = buildSavePayload()
  latestDrafts.set(key, payload)

  changes.queue({
    key,
    surface: 'page',
    scope: editorChangeScope.page(pageId),
    label: `Section ${currentSection.name || sectionId}`,
    delay,
    run: async ({ isCurrent }) => {
      if (editor.siteId !== siteId || editor.currentPage?.id !== pageId) {
        throw new Error('The site or page changed before its pending section could be saved')
      }

      const updated = await editor.updateSection(pageId, sectionId, payload)
      if (!updated) {
        // sectionStore owns errors for immediate CRUD. Autosave failures belong
        // to editorChangeStore so they remain retryable without replacing the
        // entire editor with the blocking error overlay.
        const message = sectionStore.error || 'Failed to save section'
        sectionStore.error = null
        throw new Error(message)
      }

      if (!isCurrent()) {
        const newerDraft = latestDrafts.get(key)
        if (newerDraft) restoreNewerDraft(sectionId, newerDraft)
        return
      }

      latestDrafts.delete(key)
    },
  })

  return key
}

function save() {
  queueSave()
}

async function saveImmediately(): Promise<boolean> {
  const key = queueSave(0)
  return key ? changes.flushJob(key, true) : false
}

/**
 * Clamp base delay to a sane editorial range (0–1000 ms).
 * Prevents absurd values from accidentally reaching the resolver.
 */
function clampBaseDelay(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0
  if (ms > 1000) return 1000
  return Math.round(ms)
}

/**
 * Broadcast a section-choreography preview request. The preview iframe (or
 * any listener on `window`) can handle the event and drive the animation
 * engine. Decoupling via CustomEvent avoids a direct admin → engine
 * dependency in the admin panel, where the engine lives inside the iframe.
 */
function previewChoreography() {
  if (!section.value) return
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('section-choreography-preview', {
    detail: {
      sectionId: section.value.id,
      mode: localChoreographyMode.value,
      baseDelay: clampBaseDelay(localChoreographyBaseDelay.value),
      order: localChoreographyOrder.value,
    },
  }))
}

// --- Alternating side indicator for editorial-split ---
const alternatingSideLabel = computed(() => {
  if (!section.value) return ''
  const editorialSplitSections = editor.sections
    .filter(s => s.sectionType === 'editorial-split' && !s.isHidden)
    .sort((a, b) => a.position - b.position)
  const idx = editorialSplitSections.findIndex(s => s.id === section.value!.id)
  if (idx < 0) return ''
  return idx % 2 === 0 ? 'Content left / Sidebar right' : 'Content right / Sidebar left'
})

// --- Section type change handler ---
const typeChangeWarning = ref('')
const typeChangeError = ref('')
const typeChangePending = ref(false)

const sectionBlocksList = computed(() =>
  section.value ? editor.sectionBlocks(section.value.id) : [],
)

function replaceLocalLayoutConfig(config: Record<string, any>) {
  Object.keys(localLayoutConfig).forEach(k => delete localLayoutConfig[k])
  Object.assign(localLayoutConfig, immutablePayload(config))
}

/**
 * The transition itself lives in `sectionStore.changeSectionType` so a click
 * here and an assistant editor op take one path. This handler only owns the
 * local inspector state: the pending flag, the picker settling on the
 * response, and the warning/error the panel renders.
 */
async function onTypeChange(nextType: SectionType) {
  if (typeChangePending.value || nextType === localSectionType.value) return

  const currentSection = section.value
  const currentPage = editor.currentPage
  if (!currentSection || !currentPage) return

  const pageId = currentSection.pageId || currentPage.id
  const sectionId = currentSection.id
  const previousType = localSectionType.value
  const previousConfig = immutablePayload({ ...localLayoutConfig })

  typeChangeWarning.value = ''
  typeChangeError.value = ''
  typeChangePending.value = true

  try {
    const result = await sectionStore.changeSectionType(pageId, sectionId, nextType)
    // The operator can select another section while the barrier runs. These
    // refs then already belong to that section, and writing this section's
    // values into them would be persisted onto the wrong record by the next
    // autosave.
    if (section.value?.id !== sectionId) return
    localSectionType.value = result.section.sectionType ?? nextType
    replaceLocalLayoutConfig(result.section.layoutConfig ?? {})
    typeChangeWarning.value = result.warning ?? ''
  } catch (error: any) {
    if (section.value?.id !== sectionId) return
    localSectionType.value = previousType
    replaceLocalLayoutConfig(previousConfig)
    typeChangeError.value = error?.message || 'Failed to change section type'
  } finally {
    typeChangePending.value = false
  }
}

// --- Block Roles ---

/** Compute blocks grouped by role for diagram component */
const blocksByRoleComputed = computed<Record<string, Block[]>>(() => {
  const byRole: Record<string, Block[]> = {}
  for (const block of sectionBlocksList.value) {
    const role = (block as any).layoutRole
    if (role) {
      if (!byRole[role]) byRole[role] = []
      byRole[role].push(block)
    }
  }
  return byRole
})

/** Detect slot violations (single-slot roles with multiple blocks assigned) */
const slotViolations = computed<LayoutSlot[]>(() => {
  const slots = typeSchema.value?.layoutSlots ?? []
  return slots.filter(slot => {
    if (slot.multiple) return false
    const assignedCount = sectionBlocksList.value.filter(
      b => (b as any).layoutRole === slot.role,
    ).length
    return assignedCount > 1
  })
})

/** Auto-fix slot violations by keeping only the first block in each single-slot role */
async function autoFixSlotViolations() {
  for (const slot of slotViolations.value) {
    const assigned = sectionBlocksList.value.filter(
      b => (b as any).layoutRole === slot.role,
    )
    // Keep first, unassign rest
    for (let i = 1; i < assigned.length; i++) {
      const block = assigned[i]
      if (block) await editor.updateBlock(block.id, { layoutRole: null })
    }
  }
}

const dismissedSlotViolations = ref(false)
function dismissSlotViolationsWarning() {
  dismissedSlotViolations.value = true
}

/** Get the block schema for a given block type */
function getBlockSchema(blockType: string): BlockSchema | null {
  return editor.schemas[blockType] ?? null
}

/** Human-readable label for a block type */
function blockLabel(block: Block): string {
  const schema = getBlockSchema(block.type)
  if (!schema) return block.type
  const label = schema.label
  return typeof label === 'string' ? label : label['en-US'] || label['en'] || block.type
}

/** Get role note for a block assigned to a specific layout role (if any) */
function getRoleNote(blockType: string, role: string): string | null {
  const schema = getBlockSchema(blockType)
  if (!schema) return null
  const notes = schema.roleNotes
  return notes?.[role] ?? null
}

/** Get compatible roles for a block type, intersected with current section type's layoutSlots */
function getCompatibleRoles(blockType: string): string[] {
  const schema = getBlockSchema(blockType)
  const compatible: string[] = schema?.compatibleSectionRoles ?? []
  if (compatible.length === 0) return [] // cannot be assigned named roles
  const typeSlots = typeSchema.value?.layoutSlots ?? []
  const slotRoles = new Set<string>(typeSlots.map(s => s.role))
  return compatible.filter(r => slotRoles.has(r))
}

/** Check which required slots are unfilled */
const unfilledRequired = computed<LayoutSlot[]>(() => {
  const slots = typeSchema.value?.layoutSlots ?? []
  return slots.filter(slot => {
    if (!slot.required) return false
    return !sectionBlocksList.value.some(b => (b as any).layoutRole === slot.role)
  })
})

/** Human-readable label for a layout role */
const roleLabelMap: Record<string, string> = {
  'section-heading': 'Section Title',
  'editorial-body': 'Main Content',
  'supporting-text': 'Sidebar Content',
  'media-gallery': 'Media (Content Column)',
  'media-chrome': 'Media (Sidebar)',
  'section-cta': 'Call to Action',
}

function roleLabel(role: string): string {
  return roleLabelMap[role] ?? role.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/** Get description for a layout role from the current section type schema */
function roleDescription(role: string): string | undefined {
  const slot = typeSchema.value?.layoutSlots?.find(s => s.role === role)
  return slot?.description
}

/** Check if a slot is already filled (for single-only slots) */
function isSlotFilled(role: string, excludeBlockId?: string): boolean {
  const slot = typeSchema.value?.layoutSlots?.find(s => s.role === role)
  if (!slot || slot.multiple) return false
  return sectionBlocksList.value.some(
    b => (b as any).layoutRole === role && b.id !== excludeBlockId,
  )
}

/** Update a block's layoutRole via the API */
async function updateBlockRole(blockId: string, newRole: string | null) {
  if (!editor.currentPage) return
  await editor.updateBlock(blockId, { layoutRole: newRole || null })
}

/** Check if a block has an invalid role assignment (role not in compatibleSectionRoles) */
function isBlockRoleInvalid(block: Block): boolean {
  const layoutRole = (block as any).layoutRole
  if (!layoutRole) return false
  const compatible = getCompatibleRoles(block.type)
  return !compatible.includes(layoutRole)
}

/** Get compatible block labels for a given role */
function getCompatibleBlockLabels(role: string): string[] {
  const schemas = editor.schemas || {}
  const compatible: string[] = []

  for (const [blockType, schema] of Object.entries(schemas)) {
    const roles = schema.compatibleSectionRoles ?? []
    const slotRoles = new Set<string>(typeSchema.value?.layoutSlots?.map(s => s.role) ?? [])
    if (roles.includes(role) && slotRoles.has(role)) {
      const label = schema.label
      const blockLabel = typeof label === 'string' ? label : label['en-US'] || label['en'] || blockType
      compatible.push(blockLabel)
    }
  }

  return compatible.sort()
}

// --- Add block for role ---
const addingForRole = ref<string | null>(null)
const pendingBlockAdd = ref<{ blockType: string; role: string } | null>(null)
const blockRoleError = ref('')
const roleAddPending = ref(false)

// --- Role help text for unassigned blocks dropdown ---
const selectedRoleHelp = ref<Record<string, string>>({})
const selectedRoleNote = ref<Record<string, string>>({})
const selectedRoleWarning = ref<Record<string, string>>({})

/** Get block types compatible with a given layout role, grouped by category */
function compatibleBlockTypesForRole(role: string): BlockPickerGroup[] {
  return groupBlocksByCategory(editor.schemas || {}, role)
}

/** Handle role selection in unassigned blocks dropdown */
async function onRoleSelectionChange(blockId: string, newRole: string | null, event: Event) {
  const select = event.target as HTMLSelectElement

  // Check if assigning to a filled single slot
  if (newRole && isSlotFilled(newRole, blockId)) {
    const slot = typeSchema.value?.layoutSlots?.find(s => s.role === newRole)
    if (slot && !slot.multiple) {
      const existingBlock = sectionBlocksList.value.find(
        b => (b as any).layoutRole === newRole && b.id !== blockId,
      )
      if (existingBlock) {
        const existingLabel = blockLabel(existingBlock)
        selectedRoleWarning.value[blockId] = `⚠️ This role only accepts one block. Assigning this will unassign ${existingLabel}.`
        // Unassign the existing block first
        await editor.updateBlock(existingBlock.id, { layoutRole: null })
      }
    }
  } else {
    delete selectedRoleWarning.value[blockId]
  }

  // Proceed with role update
  await updateBlockRole(blockId, newRole)

  // Clear warning after update
  setTimeout(() => {
    delete selectedRoleWarning.value[blockId]
  }, 100)
}

/** Add a block to the current section with a pre-assigned layout role */
async function addBlockForRole(blockType: string, role: string): Promise<boolean> {
  if (!section.value || !editor.currentPage || roleAddPending.value) return false
  blockRoleError.value = ''

  // Do not empty a single-value slot until its replacement exists. If block
  // creation fails, the picker and the existing assignment remain untouched.
  const slot = typeSchema.value?.layoutSlots?.find(s => s.role === role)
  let existingBlock: Block | undefined
  if (slot && !slot.multiple && isSlotFilled(role)) {
    existingBlock = sectionBlocksList.value.find(b => (b as any).layoutRole === role)
  }

  roleAddPending.value = true
  try {
    const created = await editor.addBlock(blockType, null, {}, section.value.id, role)
    if (!created) {
      blockRoleError.value = editor.error || `Could not add ${blockType}. Try again.`
      return false
    }

    if (existingBlock) await editor.updateBlock(existingBlock.id, { layoutRole: null })
    addingForRole.value = null
    pendingBlockAdd.value = null
    return true
  } catch (error: any) {
    blockRoleError.value = error?.message || `Could not add ${blockType}. Try again.`
    return false
  } finally {
    roleAddPending.value = false
  }
}

/** Handle block selection in "Add [role]" dropdown */
function onBlockSelectedForRole(blockType: string, role: string) {
  if (!blockType || roleAddPending.value) return
  blockRoleError.value = ''
  const note = getRoleNote(blockType, role)
  const slotFilled = isSlotFilled(role)
  if (note || slotFilled) {
    // Show warning banner and require confirmation
    pendingBlockAdd.value = { blockType, role }
  } else {
    // No warning, add immediately
    addBlockForRole(blockType, role)
  }
}

/** Get warning message for pending block addition */
function getPendingBlockWarningMessage(): string {
  if (!pendingBlockAdd.value) return ''
  const { blockType, role } = pendingBlockAdd.value
  const roleNote = getRoleNote(blockType, role)
  const slotFilled = isSlotFilled(role)

  if (roleNote && slotFilled) {
    const existingBlock = sectionBlocksList.value.find(b => (b as any).layoutRole === role)
    const existingLabel = existingBlock ? blockLabel(existingBlock) : 'existing block'
    return `${roleNote} Additionally, this role only accepts one block. Adding this will unassign ${existingLabel}.`
  } else if (slotFilled) {
    const existingBlock = sectionBlocksList.value.find(b => (b as any).layoutRole === role)
    const existingLabel = existingBlock ? blockLabel(existingBlock) : 'existing block'
    return `This role only accepts one block. Adding this will unassign ${existingLabel}.`
  } else if (roleNote) {
    return roleNote
  }
  return ''
}

/** Confirm adding block after seeing role warning */
async function confirmAddBlockForRole() {
  if (!pendingBlockAdd.value) return
  await addBlockForRole(pendingBlockAdd.value.blockType, pendingBlockAdd.value.role)
}

/** Cancel pending block addition */
function cancelAddBlockForRole() {
  pendingBlockAdd.value = null
  addingForRole.value = null
  blockRoleError.value = ''
}

function startAddingForRole(role: string) {
  blockRoleError.value = ''
  addingForRole.value = role
}

// --- Block role context for "Default only" replacement ---
const blockRoleContexts = computed<Record<string, BlockRoleContext>>(() => {
  const result: Record<string, BlockRoleContext> = {}
  let schemas: Record<string, SectionTypeSchema>
  try {
    schemas = getSectionTypeSchemas(themeName.value)
  } catch {
    return result
  }
  for (const block of sectionBlocksList.value) {
    if (!(block as any).layoutRole && getCompatibleRoles(block.type).length === 0) {
      const blockSchema = getBlockSchema(block.type)
      result[block.id] = getBlockRoleContext(blockSchema, localSectionType.value, schemas)
    }
  }
  return result
})

// --- Options ---
const colorSchemeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'accent', label: 'Accent' },
  { value: 'transparent', label: 'Transparent' },
  { value: 'custom', label: 'Custom' },
]

const roleOptions = [
  { value: '', label: 'None' },
  { value: 'hero', label: 'Hero' },
  { value: 'content', label: 'Content' },
  { value: 'divider', label: 'Divider' },
  { value: 'footer', label: 'Footer' },
]

// Sourced, not restated: `shared/types/layout.ts` is the one declaration these
// three fields have, and the editable-surface registry resolves its
// `section-container-modes` / `layout-spacing-tiers` vocabularies from the same
// module. A local copy here is what made all three `opaque` in the registry.
const containerModeOptions = LAYOUT_CONTAINER_MODE_OPTIONS
const sectionSpaceYOptions = LAYOUT_SPACING_TIER_OPTIONS
const containerInsetXOptions = LAYOUT_SPACING_TIER_OPTIONS

// `revealPreset` is theme data, so the list is read out of the theme's own
// `motion.revealPresets` — the same keys `useSectionReveal` resolves against
// and the same set the registry publishes as this address's `theme-set`.
// `''` writes `null` (inherit the theme default); `none` disables the reveal.
const revealPresetOptions = computed(() => {
  const motion = (getThemeConfig(themeName.value) as { motion?: { revealPresets?: Record<string, unknown> } })?.motion
  const presetIds = Object.keys(motion?.revealPresets ?? {}).filter(id => id !== 'none')
  return [
    { value: '', label: 'Theme Default' },
    ...presetIds.map(id => ({ value: id, label: titleCasePresetId(id) })),
    { value: 'none', label: 'None' },
  ]
})

function titleCasePresetId(id: string): string {
  return id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

const colorSwatchMap: Record<string, string> = {
  light: '#ffffff',
  dark: '#1a1a1a',
  accent: 'var(--cms-accent)',
  transparent: 'repeating-conic-gradient(#ddd 0deg 90deg, #fff 90deg 180deg) 0 0/12px 12px',
  custom: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
}

// --- Custom color palette presets ---
const colorPalettePresets = [
  { id: 'dark', label: 'Dark', bg: '#1a1a1a', text: '#ffffff', accent: '', border: 'rgba(255,255,255,0.12)' },
  { id: 'warm', label: 'Warm', bg: '#f5f0eb', text: '#2c2c2c', accent: '#c4956a', border: '#e0d5ca' },
  { id: 'cool', label: 'Cool', bg: '#e8eef4', text: '#1c2d3f', accent: '#3a7ca5', border: '#c8d6e0' },
  { id: 'brand', label: 'Brand', bg: 'var(--cms-accent)', text: '#ffffff', accent: '#ffffff', border: 'rgba(255,255,255,0.2)' },
]

function applyColorPreset(preset: typeof colorPalettePresets[0]) {
  localLayoutConfig.customBgColor = preset.bg
  localLayoutConfig.customTextColor = preset.text
  localLayoutConfig.customAccentColor = preset.accent
  localLayoutConfig.customBorderColor = preset.border
  textColorManuallySet.value = false
  save()
}

// --- Luminance-based text color auto-suggest ---
const textColorManuallySet = ref(false)

function relativeLuminance(hex: string): number {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return 1
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

watch(() => localLayoutConfig.customBgColor, (newBg) => {
  if (!newBg || localColorScheme.value !== 'custom') return
  if (textColorManuallySet.value) {
    // Reset flag so next bg change will auto-suggest again
    textColorManuallySet.value = false
    return
  }
  const lum = relativeLuminance(newBg)
  localLayoutConfig.customTextColor = lum < 0.5 ? '#ffffff' : '#222222'
})

function onTextColorManualChange() {
  textColorManuallySet.value = true
  save()
}

// --- Advanced colors collapsed state ---
const advancedColorsOpen = ref(false)

// --- Motion: entrance preset options ---
const defaultEntranceOptions = computed(() => {
  const safe = entrancePresets.filter(p => p.group === 'safe')
  const expressive = entrancePresets.filter(p => p.group === 'expressive')
  return { safe, expressive }
})

// --- Motion: scene count for this section (explicit scenes only) ---
const sectionSceneCount = computed(() => {
  if (!section.value) return 0
  const sectionBlockIds = new Set(editor.sectionBlocks(section.value.id).map(b => b.id))
  return editor.scenes.filter(scene =>
    scene.entries.some(e => e.target.entityType === 'block' && sectionBlockIds.has(e.target.entityId)),
  ).length
})

// --- Motion: first block in section with motionSupport ---
const firstAnimatableBlock = computed(() => {
  if (!section.value) return null
  const blocks = editor.sectionBlocks(section.value.id)
  // Prefer a block whose schema has motionSupport
  const withMotion = blocks.find(b => {
    const schema = editor.schemas[b.type]
    return schema?.motionSupport
  })
  return withMotion ?? blocks[0] ?? null
})

// --- Motion: disable all confirmation state ---
const showDisableConfirm = ref(false)

async function disableAllMotion() {
  if (!section.value || !editor.currentPage) return
  // Remove all explicit scenes for blocks in this section
  const sectionBlockIds = new Set(editor.sectionBlocks(section.value.id).map(b => b.id))
  const scenesToRemove = editor.scenes.filter(scene =>
    scene.entries.some(e => e.target.entityType === 'block' && sectionBlockIds.has(e.target.entityId)),
  )
  for (const scene of scenesToRemove) {
    editor.removeScene(scene.id)
  }
  // Suppress auto-entrance generation and legacy reveal
  localDefaultBlockEntrance.value = 'none'
  localRevealPreset.value = 'none'
  showDisableConfirm.value = false
  await saveImmediately()
}
</script>

<template>
  <div v-if="section" class="section-settings">
    <h6 class="section-settings__title">Section Settings</h6>

    <!-- ═══ Basics ═══ -->
    <div class="section-settings__group">
      <div class="section-settings__group-label">Basics</div>

      <div class="mb-3">
        <label class="form-label">Section Type</label>
        <VisualOptionGroup
          :options="availableTypes.map(st => ({
            value: st.type,
            label: st.label,
            icon: sectionTypeIcon(st.type),
            description: st.description,
          }))"
          :model-value="localSectionType"
          :disabled="typeChangePending"
          mode="card"
          aria-label="Section Type"
          @update:model-value="(v: string) => onTypeChange(v as SectionType)"
        />
        <small v-if="typeSchema" class="text-muted d-block mt-1">{{ typeSchema.description }}</small>
        <div
          v-if="typeChangeError"
          class="alert alert-danger mt-2 mb-0 py-1 px-2"
          role="alert"
          data-testid="section-type-error"
          style="font-size: 12px;"
        >
          {{ typeChangeError }}
        </div>
        <div v-if="typeChangeWarning" class="alert alert-warning mt-2 mb-0 py-1 px-2" style="font-size: 12px;">
          {{ typeChangeWarning }}
        </div>
      </div>

      <div class="mb-3">
        <label class="form-label">Name</label>
        <input v-model="localName" type="text" class="form-control form-control-sm" @change="save" />
      </div>
    </div>

    <!-- ═══ Layout ═══ -->
    <div class="section-settings__group">
      <div class="section-settings__group-label">Layout</div>

      <div class="mb-3">
        <label class="form-label">Color Scheme</label>
        <VisualOptionGroup
          :options="colorSchemeOptions.map(opt => ({
            ...opt,
            swatch: colorSwatchMap[opt.value],
          }))"
          :model-value="localColorScheme"
          mode="swatch"
          compact
          aria-label="Color Scheme"
          @update:model-value="(v: string) => { localColorScheme = v; save() }"
        />
      </div>

      <template v-if="localColorScheme === 'custom'">
        <!-- Quick palette presets -->
        <div class="mb-3">
          <label class="form-label">Quick Palettes</label>
          <div class="section-settings__palette-row">
            <button
              v-for="preset in colorPalettePresets"
              :key="preset.id"
              type="button"
              class="section-settings__palette-swatch"
              :title="preset.label"
              @click="applyColorPreset(preset)"
            >
              <span
                class="section-settings__palette-bg"
                :style="{ background: preset.bg }"
              >
                <span
                  class="section-settings__palette-dot"
                  :style="{ backgroundColor: preset.text }"
                ></span>
              </span>
              <span class="section-settings__palette-label">{{ preset.label }}</span>
            </button>
          </div>
        </div>

        <!-- Color preview card -->
        <div
          class="section-settings__color-preview"
          :style="{
            backgroundColor: localLayoutConfig.customBgColor || '#ffffff',
            color: localLayoutConfig.customTextColor || '#1C1C1C',
            borderColor: localLayoutConfig.customBorderColor || 'transparent',
            border: '1px solid',
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '12px',
          }"
        >
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">Sample Heading</div>
          <div style="font-size: 12px; opacity: 0.7;">Body text preview</div>
          <div :style="{
            height: '3px',
            width: '40px',
            marginTop: '8px',
            backgroundColor: localLayoutConfig.customAccentColor || 'currentColor',
            borderRadius: '2px',
          }"></div>
        </div>

        <!-- Custom Colors -->
        <div class="mb-3">
          <label class="form-label">Background Color</label>
          <input
            v-model="localLayoutConfig.customBgColor"
            type="color"
            class="form-control form-control-sm form-control-color"
            @change="save"
          />
        </div>
        <div class="mb-3">
          <label class="form-label">Text Color</label>
          <input
            v-model="localLayoutConfig.customTextColor"
            type="color"
            class="form-control form-control-sm form-control-color"
            @change="onTextColorManualChange"
          />
        </div>

        <!-- Advanced Colors (collapsible) -->
        <details class="section-settings__advanced-colors mb-3" :open="advancedColorsOpen || undefined" @toggle="(e: Event) => advancedColorsOpen = (e.target as HTMLDetailsElement).open">
          <summary class="section-settings__advanced-summary">Advanced Colors</summary>
          <div class="section-settings__advanced-body">
            <div class="mb-3">
              <label class="form-label">Accent Color</label>
              <div class="d-flex align-items-center gap-2">
                <input
                  v-model="localLayoutConfig.customAccentColor"
                  type="color"
                  class="form-control form-control-sm form-control-color"
                  :disabled="!localLayoutConfig.customAccentColor"
                  @change="save"
                />
                <div class="form-check form-check-inline mb-0">
                  <input
                    type="checkbox"
                    class="form-check-input"
                    id="customAccentToggle"
                    :checked="!!localLayoutConfig.customAccentColor"
                    @change="localLayoutConfig.customAccentColor = localLayoutConfig.customAccentColor ? '' : '#1E3D4F'; save()"
                  />
                  <label class="form-check-label" for="customAccentToggle" style="font-size: 11px;">Override</label>
                </div>
              </div>
              <small class="text-muted">Used for buttons, links, and emphasis elements</small>
            </div>
            <div class="mb-3">
              <label class="form-label">Border Color</label>
              <div class="d-flex align-items-center gap-2">
                <input
                  v-model="localLayoutConfig.customBorderColor"
                  type="color"
                  class="form-control form-control-sm form-control-color"
                  :disabled="!localLayoutConfig.customBorderColor"
                  @change="save"
                />
                <div class="form-check form-check-inline mb-0">
                  <input
                    type="checkbox"
                    class="form-check-input"
                    id="customBorderToggle"
                    :checked="!!localLayoutConfig.customBorderColor"
                    @change="localLayoutConfig.customBorderColor = localLayoutConfig.customBorderColor ? '' : '#e0e0e0'; save()"
                  />
                  <label class="form-check-label" for="customBorderToggle" style="font-size: 11px;">Override</label>
                </div>
              </div>
              <small class="text-muted">Used for section dividers and card borders</small>
            </div>
          </div>
        </details>
      </template>

      <div class="mb-3">
        <label class="form-label">Container</label>
        <VisualOptionGroup
          :options="containerModeOptions"
          :model-value="localContainerMode"
          mode="bar"
          compact
          aria-label="Container Mode"
          @update:model-value="(v: string) => { localContainerMode = v; save() }"
        />
        <p
          v-for="hint in crossScopeWidthHints"
          :key="hint"
          class="text-muted small mb-0 mt-1"
          data-width-hint
        >
          {{ hint }}
        </p>
      </div>

      <div class="mb-3">
        <label class="form-label">Vertical Spacing</label>
        <VisualOptionGroup
          :options="sectionSpaceYOptions"
          :model-value="localSectionSpaceY"
          mode="bar"
          compact
          aria-label="Section Vertical Spacing"
          @update:model-value="(v: string) => { localSectionSpaceY = v; save() }"
        />
        <small class="text-muted">Top + bottom padding of section</small>
      </div>

      <div class="mb-3">
        <label class="form-label">Horizontal Inset</label>
        <VisualOptionGroup
          :options="containerInsetXOptions"
          :model-value="localContainerInsetX"
          mode="bar"
          compact
          aria-label="Container Horizontal Inset"
          @update:model-value="(v: string) => { localContainerInsetX = v; save() }"
        />
        <small class="text-muted">Horizontal padding inside section container</small>
        <p v-if="showCanvasInsetWarning" class="text-warning small mb-0 mt-1">
          Full Width with an inset still leaves a margin — set Horizontal Inset to None for an edge-to-edge canvas.
        </p>
      </div>

      <!-- Type-specific layout controls -->
      <template v-if="typeSchema">
        <!-- Arrangement presets (2026-09 composition unification, C2/WP-U3).
             Declared in the type's .v2.json; the choice persists as
             layoutConfig.layoutPreset and the engine applies it before the
             settings below. -->
        <div v-if="sectionPresets.length > 0" class="mb-3">
          <label class="form-label">Arrangement</label>
          <VisualOptionGroup
            :options="sectionPresets.map(preset => ({
              value: preset.id,
              label: presetLabel(preset),
              description: presetDescription(preset),
            }))"
            :model-value="localLayoutConfig.layoutPreset || ''"
            mode="card"
            compact
            aria-label="Arrangement preset"
            @update:model-value="(v: string) => { localLayoutConfig.layoutPreset = v; save() }"
          />
          <small class="text-muted d-block mt-1">The arrangement is a curated preset; the settings below can still override spacing and alignment.</small>
        </div>
        <div v-for="setting in typeSchema.settings" :key="setting.id" class="mb-3">
          <!-- The preset axis renders as the visual grid above, not as a select -->
          <template v-if="setting.id === 'layoutPreset' && sectionPresets.length > 0"><!-- skip --></template>
          <!-- Visual picker select -->
          <template v-else-if="setting.type === 'select' && setting.display === 'visual-picker'">
            <label class="form-label">{{ setting.label }}</label>
            <VisualOptionGroup
              :options="(setting.options || []).map(opt => ({
                ...opt,
                icon: settingIcons[setting.id + '.' + opt.value],
              }))"
              :model-value="localLayoutConfig[setting.id]"
              mode="card"
              compact
              :aria-label="setting.label"
              @update:model-value="(v: string) => { localLayoutConfig[setting.id] = v; save() }"
            />
            <!-- Alternating side indicator for editorial-split -->
            <small
              v-if="setting.id === 'shellSide' && localLayoutConfig[setting.id] === 'alternate'"
              class="text-muted d-block mt-1"
            >This section: {{ alternatingSideLabel }}</small>
          </template>
          <!-- Select fallback -->
          <template v-else-if="setting.type === 'select'">
            <label class="form-label">{{ setting.label }}</label>
            <select v-model="localLayoutConfig[setting.id]" class="form-select form-select-sm" @change="save">
              <option v-for="opt in setting.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <small v-if="setting.description" class="text-muted d-block mt-1">{{ setting.description }}</small>
            <small
              v-if="(setting.options || []).find(o => o.value === localLayoutConfig[setting.id])?.description"
              class="text-muted d-block mt-1"
            >{{ (setting.options || []).find(o => o.value === localLayoutConfig[setting.id])?.description }}</small>
          </template>

          <!-- Toggle -->
          <template v-else-if="setting.type === 'toggle'">
            <div class="form-check">
              <input
                v-model="localLayoutConfig[setting.id]"
                type="checkbox"
                class="form-check-input"
                :id="`layout-${setting.id}`"
                @change="save"
              />
              <label class="form-check-label" :for="`layout-${setting.id}`">{{ setting.label }}</label>
            </div>
            <small v-if="setting.description" class="text-muted d-block mt-1">{{ setting.description }}</small>
          </template>

          <!-- Text fallback -->
          <template v-else>
            <label class="form-label">{{ setting.label }}</label>
            <input v-model="localLayoutConfig[setting.id]" type="text" class="form-control form-control-sm" @change="save" />
          </template>
        </div>
      </template>
    </div>

    <!-- ═══ Block Roles ═══ -->
    <div class="section-settings__group">
      <div class="section-settings__group-label">Block Roles</div>

      <div
        v-if="blockRoleError"
        class="alert alert-danger py-1 px-2"
        role="alert"
        data-testid="block-role-error"
      >
        {{ blockRoleError }}
      </div>

      <!-- Layout diagram -->
      <SectionLayoutDiagram
        v-if="hasLayoutSlots"
        :section-type="localSectionType"
        :layout-config="localLayoutConfig"
        :layout-slots="typeSchema!.layoutSlots"
        :blocks-by-role="blocksByRoleComputed"
        :theme-name="themeName"
      />

      <!-- Historical data warning banner -->
      <div
        v-if="slotViolations.length > 0 && !dismissedSlotViolations"
        class="alert alert-warning section-settings__violations-alert"
        role="alert"
      >
        <div class="d-flex align-items-start gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="flex-shrink-0 mt-1">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM6.5 7h3l-.5 5h-2L6.5 7z"/>
          </svg>
          <div class="flex-grow-1">
            <strong>Multiple blocks assigned to single-slot roles</strong>
            <p class="mb-2 small">
              Some roles have multiple blocks but only render the first. Additional blocks are ignored.
              Affected roles: {{ slotViolations.map(s => roleLabel(s.role)).join(', ') }}
            </p>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-warning" @click="autoFixSlotViolations">Auto-fix (keep first only)</button>
              <button class="btn btn-sm btn-outline-secondary" @click="dismissSlotViolationsWarning">Dismiss</button>
            </div>
          </div>
        </div>
      </div>

      <template v-if="hasLayoutSlots">
        <!-- Slot-centric view: each slot shows its assigned block(s) + add button -->
        <div class="section-settings__slots">
          <div
            v-for="slot in typeSchema!.layoutSlots"
            :key="slot.role"
            class="section-settings__slot"
            :class="{ 'section-settings__slot--empty': !sectionBlocksList.some(b => (b as any).layoutRole === slot.role) }"
          >
            <div class="section-settings__slot-header">
              <span
                class="section-settings__slot-name"
                :class="{ 'section-settings__slot-name--with-help': slot.description }"
                :title="slot.description"
              >
                {{ roleLabel(slot.role) }}
                <span v-if="slot.description" class="section-settings__slot-help-icon" aria-label="Help">ⓘ</span>
              </span>
              <span v-if="slot.required" class="badge bg-warning text-dark">required</span>
              <span v-if="slot.multiple" class="badge bg-secondary">multiple</span>
              <span
                v-if="!slot.multiple && isSlotFilled(slot.role)"
                class="badge bg-info text-dark"
                title="Single-slot role: only first block renders"
              >filled</span>
            </div>

            <!-- Blocks assigned to this slot -->
            <div
              v-for="block in sectionBlocksList.filter(b => (b as any).layoutRole === slot.role)"
              :key="block.id"
            >
              <div class="section-settings__slot-block">
                <span class="section-settings__block-type">{{ blockLabel(block) }}</span>
                <button
                  class="btn btn-link btn-sm p-0 text-muted"
                  title="Unassign role"
                  @click="updateBlockRole(block.id, null)"
                >&times;</button>
              </div>
              <!-- Invalid role warning -->
              <div
                v-if="isBlockRoleInvalid(block)"
                class="section-settings__role-note section-settings__role-note--warning"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" class="section-settings__role-note-icon">
                  <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM6.5 7h3l-.5 5h-2L6.5 7z"/>
                </svg>
                <span>This block doesn't support the {{ roleLabel(slot.role) }} role. Clear the role to fix.</span>
              </div>
              <!-- Role compatibility note -->
              <div
                v-else-if="getRoleNote(block.type, slot.role)"
                class="section-settings__role-note"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" class="section-settings__role-note-icon">
                  <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM6.5 7h3l-.5 5h-2L6.5 7z"/>
                </svg>
                <span>{{ getRoleNote(block.type, slot.role) }}</span>
              </div>
            </div>

            <!-- Empty state + add button -->
            <div v-if="!sectionBlocksList.some(b => (b as any).layoutRole === slot.role) || slot.multiple" class="section-settings__slot-add">
              <template v-if="addingForRole === slot.role">
                <template v-if="!pendingBlockAdd || pendingBlockAdd.role !== slot.role">
                  <select
                    class="form-select form-select-sm"
                    :disabled="roleAddPending"
                    @change="onBlockSelectedForRole(($event.target as HTMLSelectElement).value, slot.role)"
                  >
                    <option value="" selected disabled>Pick block type...</option>
                    <optgroup
                      v-for="group in compatibleBlockTypesForRole(slot.role)"
                      :key="`group-${group.category}`"
                      :label="group.label"
                    >
                      <option
                        v-for="bt in group.blocks"
                        :key="bt.type"
                        :value="bt.type"
                        :title="bt.description"
                      >{{ getRoleNote(bt.type, slot.role) ? '⚠️ ' : '' }}{{ bt.label }}{{ bt.description ? ' — ' + bt.description.substring(0, 50) + (bt.description.length > 50 ? '...' : '') : '' }}</option>
                    </optgroup>
                  </select>
                  <button class="btn btn-link btn-sm p-0 text-muted" :disabled="roleAddPending" @click="cancelAddBlockForRole">cancel</button>
                </template>
                <!-- Warning banner for pending block addition -->
                <template v-else-if="pendingBlockAdd && pendingBlockAdd.role === slot.role">
                  <div class="section-settings__role-note mb-2">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" class="section-settings__role-note-icon">
                      <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM6.5 7h3l-.5 5h-2L6.5 7z"/>
                    </svg>
                    <span>{{ getPendingBlockWarningMessage() }}</span>
                  </div>
                  <div class="d-flex gap-2">
                    <button class="btn btn-warning btn-sm" :disabled="roleAddPending" @click="confirmAddBlockForRole">
                      {{ isSlotFilled(slot.role) ? 'Replace and Add' : 'Continue anyway' }}
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" :disabled="roleAddPending" @click="cancelAddBlockForRole">Cancel</button>
                  </div>
                </template>
              </template>
              <button
                v-else
                class="btn btn-outline-secondary btn-sm w-100"
                :class="{ 'btn-outline-warning': slot.required && !sectionBlocksList.some(b => (b as any).layoutRole === slot.role) }"
                :disabled="roleAddPending"
                @click="startAddingForRole(slot.role)"
              >
                + Add {{ roleLabel(slot.role) }}
              </button>
            </div>
          </div>
        </div>

        <!-- Validation: Unfilled Required Slots -->
        <div v-if="unfilledRequired.length > 0" class="alert alert-warning mt-3" role="alert">
          <strong>Required roles unfilled:</strong>
          <ul class="mb-0 mt-1">
            <li v-for="slot in unfilledRequired" :key="slot.role">
              <strong>{{ roleLabel(slot.role) }}</strong> — Compatible blocks:
              <template v-if="getCompatibleBlockLabels(slot.role).length > 0">
                {{ getCompatibleBlockLabels(slot.role).join(', ') }}
              </template>
              <template v-else>
                <em>No compatible blocks available</em>
              </template>
            </li>
          </ul>
        </div>

        <!-- Unassigned blocks -->
        <div v-if="sectionBlocksList.some(b => !(b as any).layoutRole)" class="mt-2">
          <small class="text-muted d-block mb-1">
            Unassigned blocks — no role in this layout. They still render, stacked below the
            section layout, until you give them one.
          </small>
          <div
            v-for="block in sectionBlocksList.filter(b => !(b as any).layoutRole)"
            :key="block.id"
            class="section-settings__block-role-row"
          >
            <div class="section-settings__block-role-label">
              <span class="section-settings__block-type">{{ blockLabel(block) }}</span>
              <span class="section-settings__unplaced-badge">no role in this layout</span>
            </div>
            <div class="section-settings__block-role-select">
              <template v-if="getCompatibleRoles(block.type).length > 0">
                <!-- Always-visible role descriptions help panel -->
                <div class="section-settings__role-help-panel mb-2">
                  <div class="section-settings__role-help-header">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" class="section-settings__role-help-icon">
                      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                      <path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z"/>
                    </svg>
                    <span class="section-settings__role-help-label">Available roles:</span>
                  </div>
                  <ul class="section-settings__role-help-list">
                    <li
                      v-for="role in getCompatibleRoles(block.type)"
                      :key="role"
                      class="section-settings__role-help-item"
                      :class="{
                        'section-settings__role-help-item--filled': isSlotFilled(role, block.id),
                        'section-settings__role-help-item--warning': getRoleNote(block.type, role)
                      }"
                    >
                      <strong class="section-settings__role-help-item-label">
                        {{ roleLabel(role) }}
                        <span v-if="isSlotFilled(role, block.id)" class="section-settings__role-help-badge">filled</span>
                      </strong>
                      <span class="section-settings__role-help-item-desc">{{ roleDescription(role) || 'No description available' }}</span>
                      <span v-if="getRoleNote(block.type, role)" class="section-settings__role-help-item-note">
                        ⚠️ {{ getRoleNote(block.type, role) }}
                      </span>
                    </li>
                  </ul>
                </div>
                <select
                  :value="''"
                  class="form-select form-select-sm"
                  @change="onRoleSelectionChange(block.id, ($event.target as HTMLSelectElement).value || null, $event)"
                  @focus="selectedRoleHelp[block.id] = ''; selectedRoleNote[block.id] = ''; delete selectedRoleWarning[block.id]"
                  @blur="delete selectedRoleHelp[block.id]; delete selectedRoleNote[block.id]; delete selectedRoleWarning[block.id]"
                  @mouseover="(e) => { const sel = e.target as HTMLSelectElement; const opt = sel.options[sel.selectedIndex]; selectedRoleHelp[block.id] = (opt?.value ? roleDescription(opt.value) : '') || '' }"
                  @input="(e) => { const sel = e.target as HTMLSelectElement; selectedRoleHelp[block.id] = roleDescription(sel.value) || ''; selectedRoleNote[block.id] = getRoleNote(block.type, sel.value) || '' }"
                >
                  <option value="">Unassigned</option>
                  <option
                    v-for="role in getCompatibleRoles(block.type)"
                    :key="role"
                    :value="role"
                    :disabled="isSlotFilled(role, block.id)"
                  >{{ getRoleNote(block.type, role) ? '⚠️ ' : '' }}{{ isSlotFilled(role, block.id) ? '🔒 ' : '' }}{{ roleLabel(role) }}</option>
                </select>
                <small v-if="selectedRoleHelp[block.id]" class="text-muted d-block mt-1">
                  {{ selectedRoleHelp[block.id] }}
                </small>
                <div
                  v-if="selectedRoleWarning[block.id]"
                  class="section-settings__role-warning mt-1"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" class="section-settings__role-warning-icon">
                    <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM6.5 7h3l-.5 5h-2L6.5 7z"/>
                  </svg>
                  <span>{{ selectedRoleWarning[block.id] }}</span>
                </div>
                <div
                  v-if="selectedRoleNote[block.id]"
                  class="section-settings__role-note mt-1"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" class="section-settings__role-note-icon">
                    <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM6.5 7h3l-.5 5h-2L6.5 7z"/>
                  </svg>
                  <span>{{ selectedRoleNote[block.id] }}</span>
                </div>
              </template>
              <template v-else>
                <small
                  class="text-muted"
                  :class="{
                    'section-settings__role-incompatible': blockRoleContexts[block.id]?.scenario === 'incompatible',
                  }"
                >
                  {{ blockRoleContexts[block.id]?.message || 'Renders below the layout.' }}
                  <span
                    v-if="blockRoleContexts[block.id]?.description"
                    class="section-settings__role-info"
                    :title="blockRoleContexts[block.id]!.description"
                    role="img"
                    :aria-label="blockRoleContexts[block.id]!.description"
                    tabindex="0"
                  >ⓘ</span>
                </small>
              </template>
            </div>
          </div>
        </div>
      </template>
      <template v-else>
        <small class="text-muted d-block">Blocks render in order. No role assignment needed.</small>
      </template>
    </div>

    <!-- ═══ Motion ═══ -->
    <div class="section-settings__group">
      <div class="section-settings__group-label">Motion</div>

      <!-- Default block entrance -->
      <div class="mb-3">
        <label class="form-label">Default Block Entrance</label>
        <select v-model="localDefaultBlockEntrance" class="form-select form-select-sm" @change="save">
          <option value="">Theme Default</option>
          <option value="none">None (disable auto-entrance)</option>
          <optgroup label="Safe">
            <option v-for="p in defaultEntranceOptions.safe" :key="p.id" :value="p.id">{{ p.name }}</option>
          </optgroup>
          <optgroup label="Expressive">
            <option v-for="p in defaultEntranceOptions.expressive" :key="p.id" :value="p.id">{{ p.name }}</option>
          </optgroup>
        </select>
        <small class="text-muted d-block mt-1">Auto-applies to all blocks in this section that don't have an explicit animation.</small>
      </div>

      <!-- Choreography Mode (SPL-117) — coordinates entry timing across blocks -->
      <div class="mb-3">
        <label class="form-label">Choreography Mode</label>
        <select v-model="localChoreographyMode" class="form-select form-select-sm" @change="save">
          <option value="none">None</option>
          <option value="stagger">Stagger</option>
          <option value="wave">Wave</option>
          <option value="simultaneous">Simultaneous</option>
        </select>
        <small class="text-muted d-block mt-1">Coordinates entry timing across blocks in this section.</small>
      </div>

      <div v-if="localChoreographyMode === 'stagger' || localChoreographyMode === 'wave'" class="mb-3">
        <label class="form-label">Base Delay (ms)</label>
        <input
          v-model.number="localChoreographyBaseDelay"
          type="number"
          min="0"
          max="1000"
          step="10"
          class="form-control form-control-sm"
          @change="save"
        >
        <small class="text-muted d-block mt-1">Delay between block entries.</small>
      </div>

      <div v-if="localChoreographyMode === 'stagger'" class="mb-3">
        <label class="form-label">Direction</label>
        <select v-model="localChoreographyOrder" class="form-select form-select-sm" @change="save">
          <option value="top-down">Top → Down</option>
          <option value="bottom-up">Bottom → Up</option>
        </select>
      </div>

      <button
        v-if="localChoreographyMode !== 'none'"
        type="button"
        class="btn btn-sm btn-outline-secondary mb-3"
        @click="previewChoreography"
      >
        Preview
      </button>

      <!-- Explicit scene count + navigate -->
      <div class="mb-3 d-flex align-items-center gap-2">
        <span class="badge bg-secondary">{{ sectionSceneCount }} explicit scene{{ sectionSceneCount !== 1 ? 's' : '' }}</span>
        <button
          v-if="firstAnimatableBlock"
          type="button"
          class="btn btn-link btn-sm p-0 text-decoration-none"
          @click="editor.selectBlock(firstAnimatableBlock!.id)"
        >Configure block animations →</button>
        <span v-else class="text-muted" style="font-size: 12px;">No blocks in section</span>
      </div>

      <!-- Disable all motion -->
      <div class="mb-3">
        <template v-if="!showDisableConfirm">
          <button type="button" class="btn btn-outline-danger btn-sm w-100" @click="showDisableConfirm = true">
            Disable All Motion
          </button>
        </template>
        <template v-else>
          <div class="section-settings__info-box section-settings__info-box--warning mb-2" style="font-size: 12px;">
            This will remove all explicit block scenes in this section and suppress auto-entrance. This cannot be undone.
          </div>
          <div class="d-flex gap-2">
            <button type="button" class="btn btn-danger btn-sm flex-fill" @click="disableAllMotion">Confirm</button>
            <button type="button" class="btn btn-outline-secondary btn-sm flex-fill" @click="showDisableConfirm = false">Cancel</button>
          </div>
        </template>
      </div>

      <!-- Legacy reveal — advanced collapsible -->
      <details class="mb-1">
        <summary class="text-muted" style="font-size: 12px; cursor: pointer; user-select: none;">Legacy Reveal (advanced)</summary>
        <div class="mt-2">
          <label class="form-label" style="font-size: 12px;">Reveal Preset <span class="badge bg-warning text-dark ms-1" style="font-size: 10px;">standalone theme only</span></label>
          <select v-model="localRevealPreset" class="form-select form-select-sm" @change="save">
            <option v-for="opt in revealPresetOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
          <small class="text-muted d-block mt-1">Targets <code>[data-reveal]</code> elements. Has no effect in the standalone theme.</small>
        </div>
      </details>
    </div>

    <!-- ═══ Advanced ═══ -->
    <div class="section-settings__group">
      <div class="section-settings__group-label">Advanced</div>

      <div class="mb-3">
        <label class="form-label">Section Role</label>
        <select v-model="localSectionRole" class="form-select form-select-sm" @change="save">
          <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <small class="text-muted">Optional semantic classification for tooling, navigation and exported markup.</small>
      </div>

      <div class="mb-3">
        <label class="form-label">Anchor</label>
        <input v-model="localAnchor" type="text" class="form-control form-control-sm" placeholder="auto-generated" @change="save" />
      </div>

      <div class="mb-3 form-check">
        <input v-model="localIsHidden" type="checkbox" class="form-check-input" id="sectionHidden" @change="save" />
        <label class="form-check-label" for="sectionHidden">Hidden</label>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.section-settings {
  padding: 1rem;

  &__title {
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--cms-line);
  }

  &__group {
    margin-bottom: 1.25rem;

    &-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--cms-ink-muted);
      margin-bottom: 0.75rem;
      padding-bottom: 0.25rem;
      border-bottom: 1px solid var(--cms-line);
    }
  }

  &__type-select {
    font-weight: 600;
  }

  &__info-box {
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    background-color: var(--cms-surface-subtle);
    border: 1px solid var(--cms-line);

    &--slots {
      background-color: var(--cms-accent-softest);
      border-color: var(--cms-accent-soft);
    }

    &--warning {
      background-color: var(--cms-warn-soft);
      border-color: var(--cms-warn);
    }
  }

  &__slots {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  &__slot {
    padding: 0.5rem;
    border-radius: 0.375rem;
    background: var(--cms-surface-subtle);
    border: 1px solid var(--cms-line);

    &--empty {
      border-style: dashed;
    }
  }

  &__slot-header {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-bottom: 0.375rem;

    .badge {
      font-size: 10px;
      font-weight: 500;
      padding: 0.15em 0.4em;
    }
  }

  &__slot-name {
    font-size: 12px;
    font-weight: 600;

    &--with-help {
      cursor: help;
    }
  }

  &__slot-help-icon {
    font-size: 11px;
    margin-left: 0.25em;
    opacity: 0.6;
    font-style: normal;
  }

  &__slot-block {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.375rem;
    margin-bottom: 0.25rem;
    border-radius: 0.25rem;
    background: white;
    border: 1px solid var(--cms-line);
    font-size: 12px;
  }

  &__violations-alert {
    padding: 0.75rem;
    margin-bottom: 1rem;
    font-size: 12px;

    p:last-of-type {
      margin-bottom: 0;
    }

    strong {
      display: block;
      margin-bottom: 0.25rem;
    }
  }

  &__role-note {
    display: flex;
    gap: 0.375rem;
    align-items: flex-start;
    padding: 0.375rem 0.5rem;
    margin-bottom: 0.25rem;
    border-radius: 0.25rem;
    background-color: var(--cms-warn-soft);
    border: 1px solid var(--cms-warn);
    font-size: 11px;
    line-height: 1.4;
    color: var(--cms-warn);

    &--warning {
      background-color: var(--cms-danger-soft);
      border-color: var(--cms-danger);
      color: var(--cms-danger);
    }
  }

  &__role-note-icon {
    flex-shrink: 0;
    margin-top: 1px;
    opacity: 0.8;
  }

  &__role-warning {
    display: flex;
    gap: 0.375rem;
    align-items: flex-start;
    padding: 0.375rem 0.5rem;
    margin-bottom: 0.25rem;
    border-radius: 0.25rem;
    background-color: var(--cms-danger-soft);
    border: 1px solid var(--cms-danger);
    font-size: 11px;
    line-height: 1.4;
    color: var(--cms-danger);
  }

  &__role-warning-icon {
    flex-shrink: 0;
    margin-top: 1px;
    opacity: 0.8;
  }

  &__role-help-panel {
    padding: 0.5rem 0.625rem;
    border-radius: 0.25rem;
    background-color: var(--cms-accent-softest);
    border: 1px solid var(--cms-accent-soft);
  }

  &__role-help-header {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-bottom: 0.375rem;
  }

  &__role-help-icon {
    flex-shrink: 0;
    opacity: 0.7;
    color: var(--cms-accent-pressed);
  }

  &__role-help-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--cms-accent-pressed);
  }

  &__role-help-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__role-help-item {
    padding: 0.375rem 0;
    font-size: 11px;
    line-height: 1.4;
    border-top: 1px solid var(--cms-accent-soft);

    &:first-child {
      padding-top: 0;
      border-top: none;
    }

    &--filled {
      opacity: 0.6;
    }

    &--warning .section-settings__role-help-item-label {
      color: var(--cms-warn);
    }
  }

  &__role-help-item-label {
    display: block;
    font-weight: 600;
    color: var(--cms-accent-pressed);
    margin-bottom: 0.125rem;
  }

  &__role-help-item-desc {
    display: block;
    color: var(--cms-ink-muted);
    font-size: 10px;
  }

  &__role-help-item-note {
    display: block;
    margin-top: 0.25rem;
    padding: 0.25rem 0.375rem;
    border-radius: 0.2rem;
    background-color: var(--cms-warn-soft);
    color: var(--cms-warn);
    font-size: 10px;
  }

  &__role-help-badge {
    display: inline-block;
    padding: 0.1em 0.35em;
    margin-left: 0.25em;
    font-size: 9px;
    font-weight: 500;
    line-height: 1;
    color: var(--cms-ink-muted);
    background-color: var(--cms-surface-sunken);
    border-radius: 0.2rem;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  // Same shape as the "filled" role badge, warning-toned: the block is on the
  // page (it renders in the fallback stack) but the layout is not placing it.
  &__unplaced-badge {
    display: inline-block;
    padding: 0.1em 0.35em;
    margin-left: 0.25em;
    font-size: 9px;
    font-weight: 500;
    line-height: 1;
    color: var(--cms-warn);
    background-color: var(--cms-warn-soft);
    border-radius: 0.2rem;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  &__slot-add {
    display: flex;
    gap: 0.375rem;
    align-items: center;

    .form-select-sm {
      font-size: 11px;
    }

    .btn-sm {
      font-size: 11px;
    }
  }

  &__block-roles {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  &__block-role-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border-radius: 0.25rem;
    background-color: var(--cms-surface-subtle);
    border: 1px solid var(--cms-line);
  }

  &__block-role-label {
    flex: 1;
    min-width: 0;
  }

  &__block-type {
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }

  &__block-role-select {
    flex: 0 0 auto;
    min-width: 140px;

    .form-select-sm {
      font-size: 11px;
      padding: 0.15rem 1.5rem 0.15rem 0.5rem;
    }
  }

  &__slot-list {
    margin: 0.5rem 0 0;
    padding-left: 1.25rem;
    font-size: 12px;

    li {
      margin-bottom: 0.25rem;
    }

    code {
      font-size: 11px;
    }
  }

  &__role-incompatible {
    color: var(--cms-warn) !important;
    font-style: italic;
  }

  &__role-info {
    cursor: help;
    font-style: normal;
    margin-left: 0.2em;
    opacity: 0.7;

    &:hover,
    &:focus {
      opacity: 1;
    }
  }

  // --- Palette presets ---
  &__palette-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  &__palette-swatch {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0;
    border: 1px solid var(--cms-line);
    border-radius: 0.375rem;
    background: transparent;
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;

    &:hover {
      border-color: var(--cms-accent);
      box-shadow: 0 0 0 2px rgba(13, 110, 253, 0.15);
    }
  }

  &__palette-bg {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 0.25rem 0.25rem 0 0;
  }

  &__palette-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  &__palette-label {
    font-size: 10px;
    font-weight: 500;
    color: var(--cms-ink-muted);
    padding: 0 0.25rem 0.25rem;
  }

  // --- Color preview card ---
  &__color-preview {
    transition: background-color var(--cms-motion-normal) var(--cms-ease-out), border-color var(--cms-motion-normal) var(--cms-ease-out), color var(--cms-motion-normal) var(--cms-ease-out);
  }

  // --- Advanced colors disclosure ---
  &__advanced-colors {
    border: 1px solid var(--cms-line);
    border-radius: 0.375rem;
    overflow: hidden;
  }

  &__advanced-summary {
    padding: 0.5rem 0.75rem;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    color: var(--cms-ink-muted);
    background: var(--cms-surface-subtle);

    &:hover {
      color: var(--cms-ink-body);
    }
  }

  &__advanced-body {
    padding: 0.75rem;
  }

  .form-label {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
}
</style>
