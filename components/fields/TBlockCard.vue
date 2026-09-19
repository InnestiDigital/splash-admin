<template>
  <div class="t-block-card">
    <!-- Header -->
    <div class="t-block-card__header" @click="openDialog">
      <span class="t-block-card__drag-handle drag-handle" @click.stop>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 4h2v2H4V4zm6 0h2v2h-2V4zM4 7h2v2H4V7zm6 0h2v2h-2V7zm-6 3h2v2H4v-2zm6 0h2v2h-2v-2z"/>
        </svg>
      </span>
      <span class="t-block-card__type">{{ schemaLabel }}</span>
      <span class="t-block-card__title">{{ blockTitle }}</span>
      <span class="t-block-card__edit-icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M12.146.146a.5.5 0 01.708 0l3 3a.5.5 0 010 .708l-10 10a.5.5 0 01-.168.11l-5 2a.5.5 0 01-.65-.65l2-5a.5.5 0 01.11-.168l10-10zM11.207 2.5L13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 01.5.5v.5h.5a.5.5 0 01.5.5v.5h.293l6.5-6.5zm-9.761 5.175l-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 015 12.5V12h-.5a.5.5 0 01-.5-.5V11h-.5a.5.5 0 01-.468-.325z"/>
        </svg>
      </span>
      <button type="button" class="t-block-card__delete" title="Delete block" @click.stop="confirmDelete">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
          <path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
        </svg>
      </button>
    </div>

    <!-- Settings Dialog -->
    <Teleport to="body">
      <div v-if="showDialog" class="t-block-card__dialog-overlay" @click.self="cancelDialog">
        <div class="t-block-card__dialog">
          <div class="t-block-card__dialog-header">
            <span class="t-block-card__dialog-type">{{ schemaLabel }}</span>
            <h3 class="t-block-card__dialog-title">{{ blockTitle || 'Edit Block' }}</h3>
            <button type="button" class="t-block-card__dialog-close" @click="cancelDialog">&times;</button>
          </div>
          <div class="t-block-card__dialog-body">
            <FormRenderer
              v-if="schema?.settings"
              :schema="schema.settings"
              :groups="schema.groups || []"
              :model-value="dialogSettings"
              @update:model-value="dialogSettings = $event"
            />
            <p v-else class="t-block-card__no-settings">
              No configurable settings for this block.
            </p>
          </div>
          <div class="t-block-card__dialog-footer">
            <button type="button" class="t-block-card__dialog-cancel" @click="cancelDialog">Cancel</button>
            <button type="button" class="t-block-card__dialog-save" @click="saveDialog">Save</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import FormRenderer from './FormRenderer.vue'
import { getLocalizedLabel, getSchemaLabel as getSchemaLabelUtil } from '~/admin/utils/labelUtils'

const props = defineProps<{
  block: Record<string, any>
  schema?: Record<string, any> | null
  expanded?: boolean
  depth?: number
}>()

const emit = defineEmits<{
  toggle: []
  update: [block: Record<string, any>]
  delete: []
}>()

const showDialog = ref(false)
const dialogSettings = ref<Record<string, any>>({})

const schemaLabel = computed(() => {
  return getSchemaLabelUtil(props.schema || null) || props.block.type || 'Block'
})

const blockTitle = computed(() => {
  const settings = props.block.settings || {}
  const titleFields = ['title', 'name', 'label', 'heading']
  for (const field of titleFields) {
    if (settings[field]) {
      return getLocalizedLabel(settings[field])
    }
  }
  return ''
})

function openDialog() {
  dialogSettings.value = JSON.parse(JSON.stringify(props.block.settings || {}))
  showDialog.value = true
}

function cancelDialog() {
  showDialog.value = false
}

function saveDialog() {
  emit('update', { ...props.block, settings: dialogSettings.value })
  showDialog.value = false
}

function confirmDelete() {
  if (confirm('Are you sure you want to delete this block?')) {
    emit('delete')
  }
}
</script>

<style scoped>
.t-block-card {
  background: var(--cms-surface);
  border: 1px solid var(--cms-line);
  border-radius: 6px;
  overflow: hidden;
}
.t-block-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.t-block-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
  background: var(--cms-canvas);
}
.t-block-card__header:hover {
  background: var(--cms-accent-softest);
}
.t-block-card__drag-handle {
  cursor: grab;
  color: var(--cms-ink-subtle);
  padding: 4px;
  margin: -4px;
  border-radius: 4px;
}
.t-block-card__drag-handle:hover {
  color: var(--cms-ink-muted);
  background: rgba(0, 0, 0, 0.05);
}
.t-block-card__type {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--cms-accent);
  background: rgba(0, 102, 255, 0.1);
  padding: 2px 6px;
  border-radius: 3px;
}
.t-block-card__title {
  flex: 1;
  font-size: 13px;
  color: var(--cms-ink-body);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.t-block-card__edit-icon {
  color: var(--cms-ink-subtle);
  display: flex;
  align-items: center;
}
.t-block-card__header:hover .t-block-card__edit-icon {
  color: var(--cms-accent);
}
.t-block-card__delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  margin: -4px;
  margin-left: 4px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--cms-ink-subtle);
  cursor: pointer;
}
.t-block-card__delete:hover {
  color: var(--cms-danger);
  background: rgba(220, 53, 69, 0.1);
}
.t-block-card__no-settings {
  margin: 0;
  font-size: 13px;
  color: var(--cms-ink-muted);
  font-style: italic;
}
</style>

<style>
.t-block-card__dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}
.t-block-card__dialog {
  background: white;
  border-radius: 10px;
  width: 520px;
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.t-block-card__dialog-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--cms-line);
  background: var(--cms-canvas);
}
.t-block-card__dialog-type {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--cms-accent);
  background: rgba(0, 102, 255, 0.1);
  padding: 2px 6px;
  border-radius: 3px;
  flex-shrink: 0;
}
.t-block-card__dialog-title {
  flex: 1;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--cms-ink-body);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.t-block-card__dialog-close {
  margin-left: auto;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--cms-ink-muted);
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  line-height: 1;
  flex-shrink: 0;
}
.t-block-card__dialog-close:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--cms-ink-body);
}
.t-block-card__dialog-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}
.t-block-card__dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--cms-line);
  background: var(--cms-canvas);
}
.t-block-card__dialog-cancel {
  padding: 8px 18px;
  background: white;
  color: var(--cms-ink-body);
  border: 1px solid var(--cms-line);
  border-radius: 5px;
  font-size: 14px;
  cursor: pointer;
}
.t-block-card__dialog-cancel:hover {
  background: var(--cms-surface-subtle);
  border-color: var(--cms-line-hover);
}
.t-block-card__dialog-save {
  padding: 8px 18px;
  background: var(--cms-accent);
  color: white;
  border: none;
  border-radius: 5px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.t-block-card__dialog-save:hover {
  background: #0052cc;
}
</style>
