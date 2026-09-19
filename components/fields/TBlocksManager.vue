<template>
  <BaseField :field="field" type="blocks" :disabled="disabled">
    <div class="t-blocks-manager" :inert="disabled || undefined">
      <!-- Empty State -->
      <div v-if="!localBlocks.length" class="t-blocks-manager__empty">
        <p>No {{ blockLabel }} added yet.</p>
      </div>

      <!-- Blocks List -->
      <div v-else class="t-blocks-manager__list">
        <TBlockCard
          v-for="(element, index) in localBlocks"
          :key="element._id"
          :block="element"
          :schema="getBlockSchema(element.type)"
          :draggable="true"
          :class="{ 't-block-card--drag-over': dragOverIndex === index }"
          @update="updateBlock(index, $event)"
          @delete="deleteBlock(index)"
          @dragstart="onDragStart(index, $event)"
          @dragover.prevent="onDragOver(index)"
          @dragleave="onDragLeave"
          @drop.prevent="onDrop(index, $event)"
          @dragend="onDragEnd"
        />
      </div>

      <!-- Add Button -->
      <button
        v-if="canAddMore"
        type="button"
        class="t-blocks-manager__add"
        :disabled="disabled"
        @click="showAddModal = true"
      >
        + Add {{ blockLabel }}
      </button>

      <!-- Add Block Modal -->
      <div v-if="showAddModal" class="t-blocks-manager__modal-overlay" @click.self="closeModal">
        <div
          ref="modalEl"
          class="t-blocks-manager__modal"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
        >
          <div class="t-blocks-manager__modal-header">
            <h4 :id="titleId">Add {{ blockLabel }}</h4>
            <button type="button" class="t-blocks-manager__modal-close" @click="closeModal">&times;</button>
          </div>
          <div class="t-blocks-manager__modal-search">
            <input
              ref="searchInput"
              v-model="searchQuery"
              type="text"
              placeholder="Search blocks..."
              class="t-blocks-manager__search-input"
              @keydown.esc.stop="handleEscapeKey"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="t-blocks-manager__search-clear"
              @click="searchQuery = ''"
            >
              &times;
            </button>
          </div>
          <!-- tabindex="-1": Chromium makes an overflowing scroller focusable on
               its own, which would be a tab stop the trap cannot see. -->
          <div class="t-blocks-manager__modal-body" tabindex="-1">
            <button
              v-for="type in filteredBlockTypes"
              :key="type"
              type="button"
              class="t-blocks-manager__block-type"
              @click="addBlock(type)"
            >
              <span class="t-blocks-manager__block-type-name">{{ getBlockTypeLabel(type) }}</span>
              <span class="t-blocks-manager__block-type-id">{{ type }}</span>
            </button>
            <div v-if="filteredBlockTypes.length === 0" class="t-blocks-manager__no-results">
              <p>No blocks found matching "{{ searchQuery }}"</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </BaseField>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, useId } from 'vue'
import BaseField from './BaseField.vue'
import TBlockCard from './TBlockCard.vue'
import { getLocalizedLabel, getSchemaLabel } from '~/admin/utils/labelUtils'
import { useModalDialog } from '~/admin/composables/useModalDialog'

const props = defineProps<{
  field: Record<string, any>
  modelValue?: any[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any[]]
}>()

const schemas = inject<any>('blockSchemas', {})
const parentComponentSchema = inject<any>('parentComponentSchema', null)

// Drag context for cross-container support
const dragContext = inject<any>('blockDragContext', null)
const containerId = `blocks-manager-${Math.random().toString(36).slice(2, 9)}`

const localBlocks = ref<any[]>([])
const showAddModal = ref(false)
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const modalEl = ref<HTMLElement | null>(null)
const titleId = `blocks-manager-title-${useId()}`

/**
 * Normalize a block entry: legacy data may be a flat object without `type`/`settings`.
 * Convert `{ label: ..., url: ... }` → `{ type: 'menu-item', settings: { label: ..., url: ... } }`.
 */
function normalizeBlock(block: any, index: number, existingId?: string): any {
  const id = block._id || block.id || existingId || `block-${index}-${Date.now()}`

  // Already in block format (has type and settings)
  if (block.type && block.settings !== undefined) {
    return { ...block, _id: id }
  }

  // Legacy flat format — infer type from allowedBlocks
  const inferredType = (props.field?.allowedBlocks || props.field?.childBlocks || [])[0]
  if (inferredType && !block.type) {
    const { _id: _, id: __, ...rest } = block
    return { type: inferredType, settings: rest, _id: id }
  }

  return { ...block, _id: id }
}

watch(
  () => props.modelValue,
  (value) => {
    const newBlocks = value || []
    const structureChanged =
      newBlocks.length !== localBlocks.value.length ||
      newBlocks.some((block: any, i: number) => {
        const type = block.type || (props.field?.allowedBlocks || [])[0]
        const localType = localBlocks.value[i]?.type
        return type !== localType
      })

    if (structureChanged || localBlocks.value.length === 0) {
      const existingIds = localBlocks.value.map((b) => b._id)
      localBlocks.value = newBlocks.map((block: any, index: number) =>
        normalizeBlock(block, index, existingIds[index]),
      )
    } else {
      newBlocks.forEach((block: any, index: number) => {
        const normalized = normalizeBlock(block, index, localBlocks.value[index]._id)
        normalized._id = localBlocks.value[index]._id
        localBlocks.value[index] = normalized
      })
    }
  },
  { immediate: true, deep: true },
)

const blockLabel = computed(() => {
  const label = getLocalizedLabel(props.field?.label)
  if (label.endsWith('s')) return label.slice(0, -1)
  return label || 'Block'
})

const allowedBlockTypes = computed(() => {
  return props.field?.allowedBlocks || props.field?.childBlocks || []
})

const filteredBlockTypes = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  if (!query) {
    return allowedBlockTypes.value
  }

  return allowedBlockTypes.value.filter((type: string) => {
    const schema = getBlockSchema(type)

    // Search in label
    const label = getSchemaLabel(schema) || formatTypeName(type)
    if (label.toLowerCase().includes(query)) {
      return true
    }

    // Search in type
    if (type.toLowerCase().includes(query)) {
      return true
    }

    // Search in description
    if (schema?.description) {
      const description = typeof schema.description === 'string'
        ? schema.description
        : getLocalizedLabel(schema.description)
      if (description && description.toLowerCase().includes(query)) {
        return true
      }
    }

    return false
  })
})

const maxBlocks = computed(() => props.field?.maxBlocks || Infinity)
const canAddMore = computed(() => localBlocks.value.length < maxBlocks.value)

/**
 * Get schema for a nested block type. Prefers the inline definition from the
 * parent component schema's `blocks` array (which can extend the base schema
 * with extra fields like `span`), then falls back to the global registry.
 */
function getBlockSchema(type: string) {
  // Check parent component schema's inline blocks definitions first
  const parent = parentComponentSchema?.value
  if (parent?.blocks) {
    const inline = parent.blocks.find((b: any) => b.type === type)
    if (inline) return inline
  }

  // Fallback to global registry
  return schemas.value?.[type] || schemas[type] || null
}

function getBlockTypeLabel(type: string): string {
  const schema = getBlockSchema(type)
  return getSchemaLabel(schema) || formatTypeName(type)
}

function formatTypeName(type: string): string {
  return type
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function emitUpdate() {
  const cleaned = localBlocks.value.map(({ _id, ...block }) => block)
  emit('update:modelValue', cleaned)
}

function updateBlock(index: number, updatedBlock: any) {
  localBlocks.value[index] = {
    ...updatedBlock,
    _id: localBlocks.value[index]._id,
  }
  emitUpdate()
}

function deleteBlock(index: number) {
  localBlocks.value.splice(index, 1)
  emitUpdate()
}

// Drag-and-drop reordering (with cross-container support)
function onDragStart(index: number, event: DragEvent) {
  dragIndex.value = index
  const blockData = localBlocks.value[index]

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    // Store block data for cross-container drag
    const dragPayload = {
      containerId,
      sourceIndex: index,
      block: { ...blockData },
    }
    event.dataTransfer.setData('application/json', JSON.stringify(dragPayload))
  }

  // Update global drag context if available
  if (dragContext) {
    dragContext.value = {
      sourceContainerId: containerId,
      sourceIndex: index,
      block: { ...blockData },
    }
  }
}

function onDragOver(index: number) {
  dragOverIndex.value = index
}

function onDragLeave() {
  dragOverIndex.value = null
}

function onDrop(targetIndex: number, event: DragEvent) {
  event.preventDefault()
  dragOverIndex.value = null

  try {
    // Try to get drag data from dataTransfer
    const dataText = event.dataTransfer?.getData('application/json')
    let dragPayload: any = null

    if (dataText) {
      try {
        dragPayload = JSON.parse(dataText)
      } catch {
        // Fall back to dragContext
        dragPayload = dragContext?.value
      }
    } else {
      // Use dragContext as fallback
      dragPayload = dragContext?.value
    }

    if (!dragPayload) {
      // No drag data available
      dragIndex.value = null
      return
    }

    const { sourceContainerId, sourceIndex, block } = dragPayload

    // Check if the block type is allowed in this container
    if (!isBlockTypeAllowed(block.type)) {
      console.warn(`[TBlocksManager] Block type "${block.type}" is not allowed in this container`)
      dragIndex.value = null
      return
    }

    if (sourceContainerId === containerId) {
      // Same container — reorder
      if (dragIndex.value === null || dragIndex.value === targetIndex) {
        dragIndex.value = null
        return
      }
      const item = localBlocks.value.splice(dragIndex.value, 1)[0]
      localBlocks.value.splice(targetIndex, 0, item)
      dragIndex.value = null
      emitUpdate()
    } else {
      // Cross-container — add block at target position
      const newBlock = {
        ...block,
        _id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      }
      localBlocks.value.splice(targetIndex, 0, newBlock)
      emitUpdate()

      // Signal source container to remove the block (via dragContext)
      if (dragContext) {
        dragContext.value = {
          ...dragContext.value,
          removeFromSource: true,
          removedFromContainer: sourceContainerId,
        }
      }
    }
  } catch (err) {
    console.error('[TBlocksManager] Drop error:', err)
  } finally {
    dragIndex.value = null
  }
}

function onDragEnd() {
  // Check if the block was moved to another container
  if (dragContext?.value?.removeFromSource && dragContext.value.removedFromContainer === containerId) {
    const sourceIndex = dragContext.value.sourceIndex
    if (sourceIndex !== null && sourceIndex !== undefined && localBlocks.value[sourceIndex]) {
      localBlocks.value.splice(sourceIndex, 1)
      emitUpdate()
    }
  }

  dragIndex.value = null
  dragOverIndex.value = null

  // Clear drag context
  if (dragContext) {
    dragContext.value = null
  }
}

function isBlockTypeAllowed(blockType: string): boolean {
  const allowed = allowedBlockTypes.value
  return allowed.length === 0 || allowed.includes(blockType)
}

function closeModal() {
  showAddModal.value = false
  searchQuery.value = ''
}

function handleEscapeKey() {
  if (searchQuery.value) {
    searchQuery.value = ''
  } else {
    closeModal()
  }
}

function addBlock(type: string) {
  const schema = getBlockSchema(type)
  const defaults = schema?.defaults || props.field?.defaultBlock?.settings || {}

  const newBlock = {
    _id: `block-${Date.now()}`,
    type,
    settings: { ...defaults },
  }

  localBlocks.value.push(newBlock)
  closeModal()
  emitUpdate()
}

// Escape · the Tab trap · initial focus on the search field · focus restored to
// the Add button · the body scroll lock. The input keeps its own Escape handler
// (clear the query before closing) and `.stop`s, so this composable's Escape
// branch only runs when focus is elsewhere in the dialog.
useModalDialog({
  open: showAddModal,
  dialog: modalEl,
  onClose: closeModal,
  initialFocus: () => searchInput.value,
})
</script>

<style scoped>
.t-blocks-manager {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.t-blocks-manager__empty {
  padding: 24px;
  text-align: center;
  border: 1px dashed var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}
.t-blocks-manager__empty p {
  margin: 0;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-sm, 13px);
}
.t-blocks-manager__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.t-block-card--drag-over {
  border-top: 2px solid var(--cms-accent, var(--cms-accent));
}

.t-blocks-manager__add {
  min-height: 40px;
  padding: 10px 12px;
  border: 1px dashed var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: var(--cms-surface);
  font-size: var(--cms-fs-sm, 13px);
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  touch-action: manipulation;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}
.t-blocks-manager__modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(33, 30, 25, 0.48);
  z-index: 1000;
}
.t-blocks-manager__modal {
  width: 380px;
  max-width: 100%;
  max-height: 80vh;
  overflow: hidden;
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-dialog, 14px);
  background: var(--cms-surface);
  box-shadow: var(--cms-elev-3, 0 24px 60px rgba(33, 30, 25, 0.18));
}
.t-blocks-manager__modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--cms-line, var(--cms-line));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}
.t-blocks-manager__modal-header h4 {
  margin: 0;
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-lg, 16px);
  font-weight: 600;
}
.t-blocks-manager__modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: transparent;
  font-size: 22px;
  cursor: pointer;
  touch-action: manipulation;
  transition:
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}
.t-blocks-manager__modal-search {
  position: relative;
  padding: 12px 16px 0 16px;
}
.t-blocks-manager__search-input {
  width: 100%;
  min-height: 40px;
  padding: 8px 36px 8px 12px;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: var(--cms-surface);
  font: inherit;
  font-size: var(--cms-fs-body, 14px);
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    box-shadow var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}
.t-blocks-manager__search-input:focus-visible {
  outline: none;
  border-color: var(--cms-accent, var(--cms-accent));
  box-shadow: 0 0 0 3px var(--cms-accent-ring, rgba(46, 125, 50, 0.2));
}
.t-blocks-manager__search-clear {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--cms-radius-control, 6px);
  background: transparent;
  font-size: 18px;
  color: var(--cms-ink-subtle, var(--cms-ink-subtle));
  cursor: pointer;
  line-height: 1;
  touch-action: manipulation;
  transition:
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}
.t-blocks-manager__modal-body {
  padding: 12px;
  max-height: 60vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.t-blocks-manager__block-type {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 12px;
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  cursor: pointer;
  text-align: left;
  touch-action: manipulation;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}
.t-blocks-manager__block-type-name {
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-body, 14px);
  font-weight: 600;
}
.t-blocks-manager__block-type-id {
  margin-top: 2px;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--cms-fs-overline, 11px);
}
.t-blocks-manager__no-results {
  padding: 32px 16px;
  text-align: center;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
}
.t-blocks-manager__no-results p {
  margin: 0;
  font-size: var(--cms-fs-sm, 13px);
}

.t-blocks-manager__add:focus-visible,
.t-blocks-manager__modal-close:focus-visible,
.t-blocks-manager__search-clear:focus-visible,
.t-blocks-manager__block-type:focus-visible {
  outline: 2px solid var(--cms-accent, var(--cms-accent));
  outline-offset: 2px;
}

.t-blocks-manager__add:active,
.t-blocks-manager__modal-close:active,
.t-blocks-manager__block-type:active {
  transform: scale(0.97);
}

@media (hover: hover) and (pointer: fine) {
  .t-blocks-manager__add:hover {
    border-color: var(--cms-accent, var(--cms-accent));
    color: var(--cms-accent-pressed, var(--cms-accent-pressed));
    background: var(--cms-accent-softest, var(--cms-accent-softest));
  }

  .t-blocks-manager__modal-close:hover,
  .t-blocks-manager__search-clear:hover {
    color: var(--cms-ink, var(--cms-ink));
    background: var(--cms-surface-sunken, var(--cms-surface-sunken));
  }

  .t-blocks-manager__block-type:hover {
    border-color: var(--cms-accent, var(--cms-accent));
    background: var(--cms-accent-softest, var(--cms-accent-softest));
  }
}
</style>
