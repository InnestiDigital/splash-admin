<template>
  <BaseField
    :field="field"
    type="repeater"
    :show-label="true"
    :error="activeNestedValidationError"
    :disabled="disabled"
  >
    <div
      class="t-repeater"
      :inert="disabled || undefined"
      :aria-invalid="activeNestedValidationError ? 'true' : undefined"
      :aria-describedby="activeNestedValidationError ? `${field.id}-error` : undefined"
    >
      <!-- Empty state -->
      <div v-if="localItems.length === 0" class="t-repeater__empty">
        <p>No items added yet.</p>
      </div>

      <!-- Item rows -->
      <div
        v-for="(item, index) in localItems"
        :key="item._id"
        class="t-repeater__item"
      >
        <!-- Item header -->
        <div class="t-repeater__item-header">
          <span class="t-repeater__item-label">Item {{ index + 1 }}</span>
          <div class="t-repeater__item-actions">
            <button
              type="button"
              class="t-repeater__btn"
              :disabled="index === 0 || disabled"
              title="Move up"
              @click="moveUp(index)"
            >
              ▲
            </button>
            <button
              type="button"
              class="t-repeater__btn"
              :disabled="index === localItems.length - 1 || disabled"
              title="Move down"
              @click="moveDown(index)"
            >
              ▼
            </button>
            <button
              type="button"
              class="t-repeater__btn t-repeater__btn--delete"
              :disabled="disabled"
              title="Remove item"
              @click="removeItem(index)"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- Item fields -->
        <div class="t-repeater__item-fields">
          <FormRenderer
            :schema="field.fields || []"
            :model-value="itemWithoutId(item)"
            @update:model-value="updateItem(index, $event)"
            @validity-change="(valid, errors) => onItemValidityChange(String(item._id), valid, errors)"
          />
        </div>
      </div>

      <!-- Add button -->
      <button
        v-if="canAddMore"
        type="button"
        class="t-repeater__add"
        :disabled="disabled"
        @click="addItem"
      >
        + Add item
      </button>
    </div>
  </BaseField>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import BaseField from './BaseField.vue'
import FormRenderer from './FormRenderer.vue'

const props = defineProps<{
  field: Record<string, any>
  modelValue?: any[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any[]]
  'validation-error': [fieldId: string, error: string | null]
}>()

const localItems = ref<any[]>([])
const itemValidationErrors = ref<Record<string, Record<string, string>>>({})

const nestedValidationError = computed<string | null>(() => {
  for (let index = 0; index < localItems.value.length; index += 1) {
    const item = localItems.value[index]
    const errors = itemValidationErrors.value[String(item?._id)]
    if (!errors) continue
    const firstError = Object.values(errors)[0]
    return firstError
      ? `Item ${index + 1}: ${firstError}`
      : `Item ${index + 1} contains invalid settings`
  }
  return null
})

const activeNestedValidationError = computed(() =>
  props.disabled ? null : nestedValidationError.value,
)

watch(
  activeNestedValidationError,
  error => emit('validation-error', String(props.field.id), error),
  { immediate: true },
)

function onItemValidityChange(
  itemId: string,
  valid: boolean,
  errors: Record<string, string> = {},
) {
  const next = { ...itemValidationErrors.value }
  if (valid) delete next[itemId]
  else next[itemId] = { ...errors }
  itemValidationErrors.value = next
}

function pruneItemValidationErrors() {
  const itemIds = new Set(localItems.value.map(item => String(item._id)))
  const next = Object.fromEntries(
    Object.entries(itemValidationErrors.value).filter(([itemId]) => itemIds.has(itemId)),
  )
  if (Object.keys(next).length !== Object.keys(itemValidationErrors.value).length) {
    itemValidationErrors.value = next
  }
}

function withId(item: Record<string, any>, index: number): any {
  return { ...item, _id: item._id || `item-${index}-${Date.now()}` }
}

function itemWithoutId(item: Record<string, any>): Record<string, any> {
  const { _id, ...rest } = item
  return rest
}

function buildDefaultItem(): Record<string, any> {
  const item: Record<string, any> = {}
  for (const childField of props.field.fields ?? []) {
    if ('default' in childField) item[childField.id] = childField.default
  }
  // Schemas that declare a required hidden `id` field (e.g. ScatterCollage
  // items) expect a stable identity on every new row. Backfill a UUID here so
  // the downstream substrate (gestures, overrides, serialization) has a key
  // to work with; existing rows keep whatever id they carry.
  const idField = (props.field.fields ?? []).find(
    (f: Record<string, any>) => f?.id === 'id' && f?.type === 'text' && f?.hidden === true,
  )
  if (idField && !item.id) {
    item.id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `item-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
  return item
}

function emitUpdate() {
  emit('update:modelValue', localItems.value.map(({ _id, ...rest }) => rest))
}

function addItem() {
  const newItem = withId(buildDefaultItem(), localItems.value.length)
  localItems.value.push(newItem)
  emitUpdate()
}

function removeItem(index: number) {
  localItems.value.splice(index, 1)
  pruneItemValidationErrors()
  emitUpdate()
}

function moveUp(index: number) {
  if (index === 0) return
  const copy = [...localItems.value]
  ;[copy[index - 1], copy[index]] = [copy[index], copy[index - 1]]
  localItems.value = copy
  emitUpdate()
}

function moveDown(index: number) {
  if (index === localItems.value.length - 1) return
  const copy = [...localItems.value]
  ;[copy[index], copy[index + 1]] = [copy[index + 1], copy[index]]
  localItems.value = copy
  emitUpdate()
}

function updateItem(index: number, newValue: Record<string, any>) {
  localItems.value[index] = { ...newValue, _id: localItems.value[index]._id }
  emitUpdate()
}

const canAddMore = computed(
  () => !props.field.maxItems || localItems.value.length < props.field.maxItems,
)

watch(
  () => props.modelValue,
  (incoming) => {
    const arr = incoming || []
    if (arr.length === localItems.value.length) {
      arr.forEach((item, i) => {
        localItems.value[i] = { ...item, _id: localItems.value[i]._id }
      })
    } else {
      localItems.value = arr.map((item, i) => withId(item, i))
    }
    pruneItemValidationErrors()
  },
  { immediate: true, deep: true },
)
</script>

<style scoped>
.t-repeater {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.t-repeater__empty {
  padding: 20px;
  text-align: center;
  border: 1px dashed var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}

.t-repeater__empty p {
  margin: 0;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-sm, 13px);
}

.t-repeater__item {
  overflow: hidden;
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface);
}

.t-repeater__item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--cms-line, var(--cms-line));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}

.t-repeater__item-label {
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-caption, 12px);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.t-repeater__item-actions {
  display: flex;
  gap: 4px;
}

.t-repeater__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: var(--cms-surface);
  font-size: 11px;
  cursor: pointer;
  line-height: 1.4;
  touch-action: manipulation;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.t-repeater__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.t-repeater__item-fields {
  padding: 12px;
}

.t-repeater__add {
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
  width: 100%;
  touch-action: manipulation;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.t-repeater__add:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.t-repeater__btn:focus-visible,
.t-repeater__add:focus-visible {
  outline: 2px solid var(--cms-accent, var(--cms-accent));
  outline-offset: 2px;
}

.t-repeater__btn:active:not(:disabled),
.t-repeater__add:active:not(:disabled) {
  transform: scale(0.97);
}

@media (hover: hover) and (pointer: fine) {
  .t-repeater__btn:hover:not(:disabled) {
    border-color: var(--cms-line-hover, var(--cms-line-hover));
    background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  }

  .t-repeater__btn--delete:hover:not(:disabled) {
    border-color: var(--cms-danger, var(--cms-danger));
    color: var(--cms-danger, var(--cms-danger));
    background: var(--cms-danger-soft, var(--cms-danger-soft));
  }

  .t-repeater__add:hover:not(:disabled) {
    border-color: var(--cms-accent, var(--cms-accent));
    color: var(--cms-accent-pressed, var(--cms-accent-pressed));
    background: var(--cms-accent-softest, var(--cms-accent-softest));
  }
}
</style>
