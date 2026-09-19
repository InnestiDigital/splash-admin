<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEditorStore } from '~/admin/stores/editorStore'
import { useClipboardStore } from '~/admin/stores/clipboardStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import { getSectionTypeSchema } from '~/shared/features/cms/sectionSchemas'
import { sectionTypeIcon } from './sectionTypeIcons'
import SectionPresetPicker from './SectionPresetPicker.vue'
import type { SectionPreset } from '~/shared/types/sectionTypes'
import type { Section } from '~/server/storage/types'

const editor = useEditorStore()
const clipboard = useClipboardStore()
const siteStore = useSiteStore()
// Adding a component reuses the parent tree's add-block modal — emit up rather
// than duplicate the picker here.
defineEmits<{ (e: 'add-block'): void }>()
const showPresetPicker = ref(false)
const creatingSection = ref(false)
const creationError = ref<string | null>(null)

const themeName = computed(() => siteStore.activeSiteTheme || 'standalone')

// Blocks belonging to a section (its components), for the nested list.
function sectionBlocksOf(sectionId: string) {
  return editor.sectionBlocks?.(sectionId) ?? []
}

// Human label for a component row: schema label if present, else a prettified
// block type. Mirrors NavigationTree.getBlockLabel without importing it.
function blockLabel(block: { type?: string }): string {
  const raw = (editor.schemas as Record<string, { label?: unknown }> | undefined)?.[block.type ?? '']?.label
  if (raw) return typeof raw === 'string' ? raw : ((raw as Record<string, string>)['en-US'] ?? Object.values(raw as Record<string, string>)[0] ?? String(block.type))
  return String(block.type || 'Block')
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c: string) => c.toUpperCase())
}

// Show all sections including hidden ones
const sections = computed(() =>
  (editor.sections || []).slice().sort((a, b) => a.position - b.position)
)

function onSelect(sectionId: string) {
  // If a component of this section is currently selected (green), tapping the
  // section header returns to editing the SECTION itself (clears the component)
  // and keeps the group open — not a collapse.
  if (editor.activeSectionId === sectionId && editor.selectedBlockId) {
    editor.selectSection(sectionId)
    return
  }
  // Otherwise toggle: re-tapping the open section-level row closes it.
  editor.selectSection(editor.activeSectionId === sectionId ? null : sectionId)
}

function onAdd() {
  creationError.value = null
  showPresetPicker.value = true
}

async function onSelectPreset(preset: SectionPreset) {
  if (!editor.currentPage) return
  const name = `Section ${(editor.sections?.length ?? 0) + 1}`
  creationError.value = null
  creatingSection.value = true
  try {
    const created = await editor.createSectionFromPreset(editor.currentPage.id, preset, name)
    if (created) showPresetPicker.value = false
    else creationError.value = editor.error || 'The section could not be created. Retry when pending changes are saved.'
  } finally {
    creatingSection.value = false
  }
}

async function onCreateFromScratch() {
  if (!editor.currentPage) return
  const name = `Section ${(editor.sections?.length ?? 0) + 1}`
  creationError.value = null
  creatingSection.value = true
  try {
    const created = await editor.createSection(editor.currentPage.id, { name })
    if (created) showPresetPicker.value = false
    else creationError.value = editor.error || 'The section could not be created. Retry when pending changes are saved.'
  } finally {
    creatingSection.value = false
  }
}

function onCancelPicker() {
  showPresetPicker.value = false
}

const orphanedCount = computed(() => editor.orphanedBlocks?.length ?? 0)

// Get actual color for section badge
function getSectionColor(section: Section): string {
  switch (section.colorScheme) {
    case 'light':
      return '#ffffff'
    case 'dark':
      return '#1a1a1a'
    case 'accent': {
      // Try to get theme primary color from themeSettings
      const primaryColor = editor.themeSettings?.primaryColor
      // Fallback to theme default primary color
      return primaryColor || '#1E3D4F'
    }
    case 'custom': {
      // Get custom background color from layoutConfig
      const customBg = section.layoutConfig?.customBgColor
      return customBg || '#ffffff'
    }
    default:
      return '#ffffff'
  }
}

// Get tooltip text for color scheme badge
function getColorSchemeTooltip(section: Section): string {
  switch (section.colorScheme) {
    case 'light':
      return 'Color scheme: Light'
    case 'dark':
      return 'Color scheme: Dark'
    case 'accent':
      return 'Color scheme: Accent (primary)'
    case 'custom': {
      const color = section.layoutConfig?.customBgColor || '#ffffff'
      return `Color scheme: Custom (${color})`
    }
    default:
      return 'Color scheme: Light'
  }
}

// Drag-and-drop state
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const dragBlockId = ref<string | null>(null)
const dragOverBlockId = ref<string | null>(null)

function onDragStart(event: DragEvent, index: number) {
  dragIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(event: DragEvent, index: number) {
  if (dragIndex.value === null || dragIndex.value === index) return
  dragOverIndex.value = index
}

function onDragLeave() {
  dragOverIndex.value = null
}

function onDrop(_event: DragEvent, toIndex: number) {
  dragOverIndex.value = null
  const fromIndex = dragIndex.value
  if (fromIndex === null || fromIndex === toIndex || !editor.currentPage) return

  const ordered = sections.value.map(s => s.id)
  const [moved] = ordered.splice(fromIndex, 1)
  if (!moved) return
  ordered.splice(toIndex, 0, moved)
  editor.reorderSections(editor.currentPage.id, ordered)
}

function onDragEnd() {
  dragIndex.value = null
  dragOverIndex.value = null
}

function onBlockDragStart(event: DragEvent, blockId: string) {
  dragBlockId.value = blockId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', blockId)
  }
}

function onBlockDragOver(blockId: string) {
  if (!dragBlockId.value || dragBlockId.value === blockId) return
  dragOverBlockId.value = blockId
}

function onBlockDrop(sectionId: string, targetBlockId: string) {
  const sourceBlockId = dragBlockId.value
  dragOverBlockId.value = null
  if (!sourceBlockId || sourceBlockId === targetBlockId) return

  const sectionOrder = sectionBlocksOf(sectionId).map(block => block.id)
  const fromIndex = sectionOrder.indexOf(sourceBlockId)
  const toIndex = sectionOrder.indexOf(targetBlockId)
  if (toIndex === -1) return

  // Cross-section drop onto a member row: move into this section at the
  // target's index, unroled (the section's plain body). Role assignment is
  // the slot rows' job.
  if (fromIndex === -1) {
    void editor.moveBlockToSection(sourceBlockId, sectionId, toIndex, null)
    dragBlockId.value = null
    return
  }

  const [moved] = sectionOrder.splice(fromIndex, 1)
  if (!moved) return
  sectionOrder.splice(toIndex, 0, moved)

  // Preserve every other section's relative position while replacing the
  // slots occupied by this section's layers with their new stacking order.
  const sectionIds = new Set(sectionOrder)
  let cursor = 0
  const pageOrder = editor.blocks
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(block => sectionIds.has(block.id) ? sectionOrder[cursor++]! : block.id)
  editor.reorderBlocks(pageOrder)
  dragBlockId.value = null
}

function onBlockDragEnd() {
  dragBlockId.value = null
  dragOverBlockId.value = null
  dragOverSectionId.value = null
}

// ── Drag-into-zone (2026-09 composition unification, C4/WP-U2) ──────────────
//
// While a block is being dragged, every section with declared layout slots
// renders its slots as drop rows. Dropping onto a slot MOVES the block into
// that section AND assigns the slot's role — validation runs at drag time
// (compatibility + slot capacity), so an incompatible drop is visibly
// rejected instead of silently demoting to `_default` at render time.

interface SlotDropTarget {
  role: string
  label: string
  description: string
  ok: boolean
  reason: string | null
}

const dragOverSectionId = ref<string | null>(null)

const draggingBlock = computed(() =>
  dragBlockId.value ? editor.blocks.find(block => block.id === dragBlockId.value) ?? null : null,
)

function roleLabelText(role: string): string {
  return String(role)
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * The declared slots of a section's type, in declaration order. The AUTHORING
 * schema (.settings.json) is the source of truth: it carries `multiple`
 * (slot capacity) and the human description the drop row shows.
 */
function slotsOf(section: Section): readonly { role: string; description?: string; multiple?: boolean }[] {
  if (!section.sectionType) return []
  try {
    return getSectionTypeSchema(themeName.value, section.sectionType)?.layoutSlots ?? []
  } catch {
    return []
  }
}

/**
 * Drag-time verdict for dropping the dragged block onto one slot of a section.
 * Pure over (dragged block, section's seated blocks, schemas) so tests can
 * drive it without DOM.
 */
function slotDropTarget(section: Section, slot: { role: string; description?: string; multiple?: boolean }): SlotDropTarget {
  const block = draggingBlock.value
  const label = roleLabelText(slot.role)
  if (!block) return { role: slot.role, label, description: slot.description ?? '', ok: false, reason: null }

  const blockSchema = (editor.schemas as Record<string, { compatibleSectionRoles?: readonly string[] }> | undefined)?.[block.type]
  const compatible = blockSchema?.compatibleSectionRoles
  if (compatible && compatible.length > 0 && !compatible.includes(slot.role)) {
    return { role: slot.role, label, description: slot.description ?? '', ok: false,
      reason: `${blockLabel(block)} cannot take the ${label} role` }
  }

  const occupants = sectionBlocksOf(section.id)
    .filter(member => member.layoutRole === slot.role && member.id !== block.id)
  if (slot.multiple === false && occupants.length > 0) {
    return { role: slot.role, label, description: slot.description ?? '', ok: false,
      reason: `${label} accepts only one block` }
  }

  return { role: slot.role, label, description: slot.description ?? '', ok: true, reason: null }
}

function onSlotDrop(section: Section, target: SlotDropTarget) {
  const blockId = dragBlockId.value
  dragOverSectionId.value = null
  if (!blockId || !target.ok) return
  void editor.moveBlockToSection(blockId, section.id, Number.MAX_SAFE_INTEGER, target.role)
  dragBlockId.value = null
}

/**
 * Drop onto the section's plain body: move without a role (the `_default`
 * bucket — how a stacked section has always worked), or reorder when the
 * dragged block already lives here.
 */
function onSectionBodyDrop(section: Section) {
  const blockId = dragBlockId.value
  dragOverSectionId.value = null
  if (!blockId) return
  const members = sectionBlocksOf(section.id)
  if (members.some(member => member.id === blockId)) return // same-section drop = no-op, reorder handles it
  void editor.moveBlockToSection(blockId, section.id, members.length, null)
  dragBlockId.value = null
}

function onSectionHeaderDragOver(sectionId: string) {
  if (dragBlockId.value) dragOverSectionId.value = sectionId
}

const sectionTypeLabels: Record<string, string> = {
  hero: 'Hero',
  stacked: 'Stacked',
  'editorial-split': 'Editorial',
  gallery: 'Gallery',
}
</script>

<template>
  <div class="section-list">
    <div class="section-list__header">
      <span class="section-list__label">Sections</span>
      <button class="section-list__add-btn" @click="onAdd">+ Add</button>
    </div>

    <!-- Preset Picker Modal -->
    <Teleport to="body">
      <div v-if="showPresetPicker" class="modal-overlay" @click.self="onCancelPicker">
        <div class="modal-container" :aria-busy="creatingSection || undefined">
          <SectionPresetPicker
            @select="onSelectPreset"
            @scratch="onCreateFromScratch"
            @cancel="onCancelPicker"
          />
          <p v-if="creationError" class="section-list__creation-error" role="alert">
            {{ creationError }}
          </p>
        </div>
      </div>
    </Teleport>

    <div v-if="orphanedCount > 0" class="section-list__warning">
      {{ orphanedCount }} orphaned block(s)
    </div>

    <div
      v-for="(section, index) in sections"
      :key="section.id"
      class="section-list__group"
    >
      <div
        :class="[
          'section-list__item',
          {
            'section-list__item--active': editor.activeSectionId === section.id,
            'section-list__item--hidden': section.isHidden,
            'section-list__item--drag-over': dragOverIndex === index,
          }
        ]"
        :draggable="true"
        @click="onSelect(section.id)"
        @dragstart="onDragStart($event, index)"
        @dragover.prevent="onDragOver($event, index)"
        @dragleave="onDragLeave"
        @drop="onDrop($event, index)"
        @dragend="onDragEnd"
      >
        <span class="section-list__drag">⠿</span>
        <span class="section-list__icon" v-html="sectionTypeIcon(section.sectionType)"></span>
        <span class="section-list__name">{{ section.name }}</span>
        <span class="section-list__badge">{{ sectionTypeLabels[section.sectionType] || section.sectionType }}</span>
        <div
          class="section-list__color-badge"
          :style="{ backgroundColor: getSectionColor(section) }"
          :title="getColorSchemeTooltip(section)"
        ></div>
        <span class="section-list__count">{{ sectionBlocksOf(section.id).length }}</span>
      </div>

      <!-- Components of the SELECTED section, nested + indented. The section
           row stays blue above; tapping a component row selects it (green) so
           it is always clear which level — section vs component — you edit. -->
      <div
        v-if="editor.activeSectionId === section.id"
        class="section-list__blocks"
        @dragover.prevent="onSectionHeaderDragOver(section.id)"
        @drop.prevent="onSectionBodyDrop(section)"
      >
        <!-- Role slots as drop rows while a block is being dragged (C4/WP-U2):
             dropping here MOVES the block into the section AND assigns the
             role. Rejected targets stay visible with the reason. -->
        <template v-if="dragBlockId && slotsOf(section).length > 0">
          <div
            v-for="slot in slotsOf(section)"
            :key="slot.role"
            :class="['section-list__slot', {
              'section-list__slot--rejected': !slotDropTarget(section, slot).ok,
            }]"
            :title="slotDropTarget(section, slot).reason ?? slotDropTarget(section, slot).description"
            @dragover.prevent.stop
            @drop.prevent.stop="onSlotDrop(section, slotDropTarget(section, slot))"
          >
            <span class="section-list__slot-label">{{ roleLabelText(slot.role) }}</span>
            <span v-if="!slotDropTarget(section, slot).ok" class="section-list__slot-reason">
              {{ slotDropTarget(section, slot).reason }}
            </span>
          </div>
        </template>
        <div v-if="sectionBlocksOf(section.id).length === 0 && !dragBlockId" class="section-list__blocks-empty">
          No components yet
        </div>
        <div
          v-for="block in sectionBlocksOf(section.id)"
          :key="block.id"
          :class="['section-list__block', {
            'section-list__block--active': editor.selectedBlockId === block.id,
            'section-list__block--drag-over': dragOverBlockId === block.id,
          }]"
          :draggable="true"
          @click.stop="editor.selectBlock(block.id)"
          @dragstart.stop="onBlockDragStart($event, block.id)"
          @dragover.prevent.stop="onBlockDragOver(block.id)"
          @dragleave="dragOverBlockId = null"
          @drop.prevent.stop="onBlockDrop(section.id, block.id)"
          @dragend="onBlockDragEnd"
        >
          <span class="section-list__block-drag" aria-hidden="true">⠿</span>
          <span class="section-list__block-name">{{ blockLabel(block) }}</span>
          <span
            v-if="block.layoutRole"
            class="section-list__block-role"
            :title="`Layout role: ${block.layoutRole}`"
          >{{ roleLabelText(block.layoutRole) }}</span>
          <button
            class="section-list__block-action"
            type="button"
            title="Duplicate component"
            @click.stop="editor.duplicateBlock(block.id)"
          >⧉</button>
        </div>
        <button class="section-list__add-block" type="button" @click.stop="$emit('add-block')">
          + Add component
        </button>
        <button
          v-if="clipboard.hasCopiedBlock"
          class="section-list__add-block section-list__add-block--paste"
          type="button"
          @click.stop="editor.pasteBlock()"
        >
          Paste “{{ clipboard.copiedBlock?.label }}”
        </button>
      </div>
    </div>

    <div v-if="sections.length === 0" class="section-list__empty">
      No sections yet
    </div>
  </div>
</template>

<style scoped>
.section-list {
  padding: 0;
}

.section-list__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px 4px;
}

.section-list__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--cms-ink-muted);
}

.section-list__add-btn {
  font-size: 11px;
  font-weight: 600;
  color: var(--cms-accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
  transition: background-color var(--cms-motion-fast) var(--cms-ease-out);
}

.section-list__add-btn:hover {
  background: var(--cms-accent-soft);
}

.section-list__warning {
  padding: 4px 12px;
  background: var(--cms-warn-soft);
  font-size: 11px;
  color: var(--cms-warn);
  margin: 0 12px 4px;
  border-radius: 3px;
}

.section-list__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}

.section-list__item:hover {
  background: rgba(0, 0, 0, 0.05);
}

.section-list__item--active {
  background: var(--cms-accent) !important;
  color: white;
}

.section-list__item--hidden {
  opacity: 0.5;
}

.section-list__item--drag-over {
  border-top: 2px solid var(--cms-accent);
}

.section-list__drag {
  cursor: grab;
  opacity: 0.3;
  font-size: 10px;
  line-height: 1;
  user-select: none;
  flex-shrink: 0;
}

.section-list__drag:active {
  cursor: grabbing;
}

.section-list__item:hover .section-list__drag {
  opacity: 0.6;
}

.section-list__item--active .section-list__drag {
  opacity: 0.5;
  color: white;
}

.section-list__item--hidden .section-list__name {
  text-decoration: line-through;
}

.section-list__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  opacity: 0.6;
}

.section-list__icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.section-list__item--active .section-list__icon {
  opacity: 0.8;
}

.section-list__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.section-list__badge {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.08);
  color: var(--cms-ink-muted);
  font-weight: 600;
  flex-shrink: 0;
}

.section-list__item--active .section-list__badge {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.section-list__color-badge {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid rgba(0, 0, 0, 0.12);
  flex-shrink: 0;
  cursor: pointer;
}

.section-list__item--active .section-list__color-badge {
  border-color: rgba(255, 255, 255, 0.3);
}

.section-list__count {
  font-size: 10px;
  opacity: 0.5;
  font-family: monospace;
  flex-shrink: 0;
}

.section-list__item--active .section-list__count {
  opacity: 0.7;
  color: white;
}

.section-list__empty {
  padding: 12px;
  font-size: 13px;
  color: var(--cms-ink-subtle);
  font-style: italic;
  text-align: center;
}

/* --- Nested components of the selected section --- */
.section-list__blocks {
  background: rgba(0, 0, 0, 0.02);
  padding: 2px 0 6px;
}

.section-list__blocks-empty {
  padding: 6px 12px 6px 40px;
  font-size: 12px;
  color: var(--cms-ink-subtle);
  font-style: italic;
}

/* --- Role-slot drop rows (drag-into-zone, WP-U2) --- */
.section-list__slot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 12px 2px 40px;
  padding: 5px 8px;
  border: 1px dashed var(--cms-accent);
  border-radius: 4px;
  font-size: 11.5px;
  color: var(--cms-accent);
  background: color-mix(in srgb, var(--cms-accent) 5%, transparent);
}

.section-list__slot-label {
  font-weight: 600;
}

.section-list__slot--rejected {
  border-style: dotted;
  border-color: rgba(0, 0, 0, 0.2);
  color: var(--cms-ink-subtle);
  background: none;
  cursor: not-allowed;
}

.section-list__slot-reason {
  font-size: 10.5px;
  opacity: 0.75;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-list__block-role {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.06);
  color: var(--cms-ink-muted);
  font-weight: 600;
  flex-shrink: 0;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-list__block {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px 7px 40px; /* indent so it reads as a child of the section */
  cursor: pointer;
  font-size: 12.5px;
  color: var(--cms-ink-body);
  transition: background 0.15s;
}

.section-list__block:hover {
  background: rgba(0, 0, 0, 0.05);
}

/* Component selected = GREEN (section stays blue above), so the level you are
   editing is unambiguous at a glance. Include :hover so resting the pointer on
   the active row doesn't let the lower-specificity hover grey override it. */
.section-list__block--active,
.section-list__block--active:hover {
  background: var(--cms-accent);
  color: var(--cms-surface);
}

.section-list__block-drag {
  cursor: grab;
  font-size: 10px;
  line-height: 1;
  opacity: 0.35;
  flex-shrink: 0;
}

.section-list__block:hover .section-list__block-drag,
.section-list__block--active .section-list__block-drag {
  opacity: 0.75;
}

.section-list__block--drag-over {
  box-shadow: inset 0 2px 0 var(--cms-accent);
}

.section-list__block-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.section-list__block-action {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  color: inherit;
  opacity: 0.5;
  flex-shrink: 0;
  padding: 2px 4px;
}

.section-list__block-action:hover {
  opacity: 1;
}

.section-list__add-block {
  display: block;
  width: calc(100% - 52px);
  margin: 4px 12px 2px 40px;
  text-align: left;
  background: none;
  border: 1px dashed rgba(0, 0, 0, 0.18);
  border-radius: 4px;
  padding: 5px 8px;
  font-size: 12px;
  color: var(--cms-accent);
  cursor: pointer;
}

.section-list__add-block:hover {
  background: rgba(0, 102, 255, 0.06);
}

.section-list__add-block--paste {
  color: var(--cms-ink-muted);
  border-style: solid;
}

/* Touch targets on mobile (the nav is a drawer there). */
@media (max-width: 767px) {
  .section-list__item {
    min-height: 44px;
  }

  .section-list__block {
    min-height: 40px;
    padding-top: 10px;
    padding-bottom: 10px;
  }
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}

.modal-container {
  width: 100%;
  max-width: 1000px;
  max-height: 90vh;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.section-list__creation-error {
  margin: 0;
  padding: 10px 16px;
  border-top: 1px solid color-mix(in srgb, var(--cms-danger, #9e2b25) 24%, transparent);
  color: var(--cms-danger, var(--cms-danger));
  background: color-mix(in srgb, var(--cms-danger, #9e2b25) 8%, white);
  font-size: 13px;
  line-height: 1.4;
}
</style>
