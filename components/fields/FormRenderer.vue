<template>
  <div class="form-renderer">
    <div v-if="searchable" class="form-renderer__search">
      <span class="material-icons-outlined form-renderer__search-icon" aria-hidden="true">search</span>
      <input
        v-model="search"
        type="search"
        aria-label="Filter settings"
        placeholder="Filter settings…"
        class="form-renderer__search-input"
      />
      <button
        v-if="search"
        type="button"
        class="form-renderer__search-clear"
        aria-label="Clear filter"
        @click="search = ''"
      >
        <span class="material-icons-outlined" aria-hidden="true">close</span>
      </button>
    </div>

    <template v-for="group in groupedFields" :key="group.id + (search ? '::s' : '')">
      <TGroup :label="getGroupLabelText(group)" :collapsible="true" :force-open="Boolean(search)">
        <component
          v-for="field in group.fields"
          :key="field.id"
          :is="getFieldComponent(field.type)"
          :field="field"
          :disabled="!isFieldEnabled(field)"
          :model-value="modelValue[field.id]"
          @update:model-value="updateField(field.id, $event)"
          @validation-error="onChildValidationError"
        />
      </TGroup>
    </template>

    <!-- Ungrouped fields -->
    <template v-if="ungroupedFields.length > 0">
      <component
        v-for="field in ungroupedFields"
        :key="field.id"
        :is="getFieldComponent(field.type)"
        :field="field"
        :disabled="!isFieldEnabled(field)"
        :model-value="modelValue[field.id]"
        @update:model-value="updateField(field.id, $event)"
        @validation-error="onChildValidationError"
      />
    </template>

    <div v-if="searchable && search && !hasResults" class="form-renderer__empty">
      No settings match "{{ search }}".
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch, type Component, type ComputedRef } from 'vue'
import TGroup from './TGroup.vue'
import DynamicField from './DynamicField.vue'
import TVisualPicker from './TVisualPicker.vue'
import TImagePicker from './TImagePicker.vue'
import TVideoPicker from './TVideoPicker.vue'
import TImageGallery from './TImageGallery.vue'
import TBlocksManager from './TBlocksManager.vue'
import TApiMethodSelect from './TApiMethodSelect.vue'
import TRepeater from './TRepeater.vue'
import TRichTextEditor from './TRichTextEditor.vue'
import TTokenSelector from './TTokenSelector.vue'
import { getGroupLabel, getFieldLabel } from '~/admin/utils/labelUtils'
import { evaluateShowIf } from '~/admin/utils/showIfCondition'

const props = defineProps<{
  schema: any[]
  groups?: any[]
  modelValue: Record<string, any>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
  'validation-error': [fieldId: string, error: string | null]
  'validity-change': [valid: boolean, errors: Record<string, string>]
}>()

const editingLocale = inject<ComputedRef<string>>('editingLocale', computed(() => 'en-US'))

const specialComponents: Record<string, Component> = {
  'image': TImagePicker,
  'video': TVideoPicker,
  'image-gallery': TImageGallery,
  'media': TImagePicker,
  'visual-picker': TVisualPicker,
  'blocks': TBlocksManager,
  'api-method': TApiMethodSelect,
  'repeater': TRepeater,
  'richtext': TRichTextEditor,
  'richtext-block': TRichTextEditor,
  'richtext-inline': TRichTextEditor,
  'richtext-single': TRichTextEditor,
  'token-selector': TTokenSelector,
}

const search = ref('')
const childValidationErrors = ref<Record<string, string>>({})

const normalizeQ = (s: any): string => (s || String()).toLowerCase().trim()

function noteToString(note: any): string {
  if (!note) return ''
  if (typeof note === 'string') return note
  if (typeof note === 'object') {
    let out = ''
    for (const v of Object.values(note)) {
      if (typeof v === 'string') out += ' ' + v
    }
    return out
  }
  return ''
}

function matchesSearch(field: any): boolean {
  const q = normalizeQ(search.value)
  if (!q) return true
  const label = normalizeQ(getFieldLabel(field))
  const id = normalizeQ(String(field.id))
  const note = normalizeQ(noteToString(field.note))
  const helpText = normalizeQ(noteToString(field.helpText))
  return label.includes(q) || id.includes(q) || note.includes(q) || helpText.includes(q)
}

function getFieldComponent(type: string): Component {
  return specialComponents[type] || DynamicField
}

function getGroupLabelText(group: any): string {
  return getGroupLabel(group)
}

function isFieldVisible(field: any): boolean {
  if (field.hidden || field.internal) return false
  if (!field.showIf) return true
  return evaluateShowIf(field.showIf, props.modelValue)
}

function isFieldEnabled(field: any): boolean {
  if (!field.dependsOn) return true
  return evaluateShowIf(field.dependsOn, props.modelValue)
}

function isGroupVisible(group: any): boolean {
  if (!group.showIf) return true
  return evaluateShowIf(group.showIf, props.modelValue)
}

/**
 * Fields that currently participate in the form. Search only filters the
 * presentation, so a search query must never make an invalid field valid.
 */
const activeFields = computed(() => {
  const groupIds = new Set((props.groups || []).map((group: any) => group.id))
  const visibleGroupIds = new Set(
    (props.groups || [])
      .filter((group: any) => isGroupVisible(group))
      .map((group: any) => group.id),
  )

  return props.schema.filter((field: any) => {
    if (!isFieldVisible(field)) return false
    if (field.group && groupIds.has(field.group)) return visibleGroupIds.has(field.group)
    return true
  })
})

const participatingFieldIds = computed(() => new Set(
  activeFields.value
    .filter((field: any) => isFieldEnabled(field))
    .map((field: any) => String(field.id)),
))

const groupedFields = computed(() => {
  if (!props.groups || props.groups.length === 0) return []

  return props.groups
    .filter((group: any) => isGroupVisible(group))
    .map((group: any) => ({
      ...group,
      fields: props.schema.filter((f: any) => f.group === group.id && isFieldVisible(f) && matchesSearch(f)),
    }))
    .filter((g: any) => g.fields.length > 0)
})

const ungroupedFields = computed(() => {
  const groupIds = (props.groups || []).map((g: any) => g.id)
  return props.schema.filter((f: any) => (!f.group || !groupIds.includes(f.group)) && isFieldVisible(f) && matchesSearch(f))
})

const totalVisibleFieldCount = computed(() => {
  return activeFields.value.length
})

const searchable = computed(() => totalVisibleFieldCount.value >= 8)

const hasResults = computed(() => groupedFields.value.length > 0 || ungroupedFields.value.length > 0)

const schemaValidationErrors = computed<Record<string, string>>(() => {
  const errors: Record<string, string> = {}
  for (const field of activeFields.value) {
    if (!isFieldEnabled(field)) continue
    const error = validateSchemaField(field, props.modelValue[field.id])
    if (error) errors[String(field.id)] = error
  }
  return errors
})

const validationErrors = computed<Record<string, string>>(() => {
  const errors = { ...schemaValidationErrors.value }
  for (const [fieldId, error] of Object.entries(childValidationErrors.value)) {
    if (participatingFieldIds.value.has(fieldId) && error) errors[fieldId] = error
  }
  return errors
})

// A field component may report an interaction-specific error that cannot be
// inferred from the schema. Keep the existing per-field API while exposing a
// trustworthy aggregate contract to form consumers.
function onChildValidationError(fieldId: string, error: string | null) {
  const id = String(fieldId)
  const nextErrors = { ...childValidationErrors.value }
  if (error && participatingFieldIds.value.has(id)) nextErrors[id] = error
  else delete nextErrors[id]
  childValidationErrors.value = nextErrors
  emit('validation-error', fieldId, error)
}

// Clear interaction errors when their value changes. Declarative validation
// above remains authoritative for the new value and runs synchronously.
watch(
  () => props.modelValue,
  (current, previous) => {
    if (!previous) return
    const nextErrors = { ...childValidationErrors.value }
    let changed = false
    for (const fieldId of Object.keys(nextErrors)) {
      if (!valuesEqual(current[fieldId], previous[fieldId])) {
        delete nextErrors[fieldId]
        changed = true
      }
    }
    if (changed) childValidationErrors.value = nextErrors
  },
  { deep: true },
)

// Hidden, removed, or dependency-disabled fields no longer participate in the
// form and must not retain interaction errors if they become enabled again.
watch(participatingFieldIds, (ids) => {
  const nextErrors = Object.fromEntries(
    Object.entries(childValidationErrors.value).filter(([fieldId]) => ids.has(fieldId)),
  )
  if (Object.keys(nextErrors).length !== Object.keys(childValidationErrors.value).length) {
    childValidationErrors.value = nextErrors
  }
})

watch(
  validationErrors,
  (errors) => emit('validity-change', Object.keys(errors).length === 0, { ...errors }),
  { immediate: true },
)

function updateField(fieldId: string, value: any) {
  if (childValidationErrors.value[fieldId]) {
    const nextErrors = { ...childValidationErrors.value }
    delete nextErrors[fieldId]
    childValidationErrors.value = nextErrors
  }
  emit('update:modelValue', {
    ...props.modelValue,
    [fieldId]: value,
  })
}

function resolveValidationValue(field: any, value: any): any {
  if (!field.translatable) return value
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && !Array.isArray(value) && !isTipTapDocument(value)) {
    return value[editingLocale.value] ?? ''
  }
  return value
}

function validateSchemaField(field: any, rawValue: any): string | null {
  const validation = field.validation || {}
  const value = resolveValidationValue(field, rawValue)
  const required = validation.required ?? field.required ?? false

  if (required && isEmptyValue(value, field.type)) return 'This field is required'

  // TRepeater renders a FormRenderer for each item and forwards its aggregate
  // validity for component-specific errors. Validate the declarative child
  // schema here as well so required/pattern/range errors remain authoritative
  // even while a repeater is filtered out of the settings search or its child
  // component is between renders.
  if (field.type === 'repeater' && Array.isArray(value)) {
    const childFields = Array.isArray(field.fields) ? field.fields : []
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index] && typeof value[index] === 'object' ? value[index] : {}
      for (const childField of childFields) {
        if (childField.hidden || childField.internal) continue
        if (childField.showIf && !evaluateShowIf(childField.showIf, item)) continue
        if (childField.dependsOn && !evaluateShowIf(childField.dependsOn, item)) continue
        const childError = validateSchemaField(childField, item[childField.id])
        if (childError) return `Item ${index + 1}: ${childError}`
      }
    }
  }

  const text = validationText(value)
  if (text !== null) {
    if (validation.pattern) {
      try {
        if (!new RegExp(validation.pattern).test(text)) return 'Value does not match required pattern'
      } catch {
        return 'Validation pattern is invalid'
      }
    }
    if (validation.minLength && text.length < validation.minLength) {
      return `Minimum length is ${validation.minLength} characters`
    }
    if (validation.maxLength && text.length > validation.maxLength) {
      return `Maximum length is ${validation.maxLength} characters`
    }
  }

  if (field.type === 'url' && typeof value === 'string' && value !== '') {
    const isJavascript = /^javascript:/i.test(value)
    const isRelative = /^[/#?]|^mailto:|^tel:/.test(value)
    const isAbsolute = (() => {
      try {
        new URL(value)
        return true
      } catch {
        return false
      }
    })()
    if (isJavascript || (!isRelative && !isAbsolute)) {
      return 'Enter a valid URL (e.g. https://example.com or /page)'
    }
  }

  if ((field.type === 'number' || field.type === 'range') && typeof value === 'number') {
    const min = field.options?.min
    const max = field.options?.max
    if (typeof min === 'number' && value < min) return `Value must be at least ${min}`
    if (typeof max === 'number' && value > max) return `Value must be at most ${max}`
  }

  return null
}

function isEmptyValue(value: any, fieldType: string): boolean {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'boolean') {
    return (fieldType === 'checkbox' || fieldType === 'boolean' || fieldType === 'toggle') && !value
  }
  if (isTipTapDocument(value)) return (validationText(value) ?? '').length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

function validationText(value: any): string | null {
  if (typeof value === 'string') return value
  if (!isTipTapDocument(value)) return null

  const text: string[] = []
  const visit = (node: any) => {
    if (typeof node?.text === 'string') text.push(node.text)
    if (node?.type === 'hardBreak') text.push('\n')
    if (Array.isArray(node?.content)) node.content.forEach(visit)
  }
  visit(value)
  return text.join('')
}

function isTipTapDocument(value: any): boolean {
  return Boolean(value && typeof value === 'object' && value.type === 'doc' && Array.isArray(value.content))
}

function valuesEqual(left: any, right: any): boolean {
  if (Object.is(left, right)) return true
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    try {
      return JSON.stringify(left) === JSON.stringify(right)
    } catch {
      return false
    }
  }
  return false
}
</script>

<style scoped>
.form-renderer {
  display: flex;
  flex-direction: column;
  gap: var(--cms-sp-4, 16px);
}

.form-renderer__search {
  position: relative;
  display: flex;
  align-items: center;
}

.form-renderer__search-icon {
  position: absolute;
  left: 12px;
  z-index: 1;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: 18px;
  pointer-events: none;
}

.form-renderer__search-input {
  width: 100%;
  height: var(--cms-density-md, 40px);
  padding: 0 38px;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: var(--cms-surface);
  box-sizing: border-box;
  font: inherit;
  font-size: var(--cms-fs-sm, 13px);
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    box-shadow var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.form-renderer__search-input:focus {
  outline: none;
  border-color: var(--cms-accent, var(--cms-accent));
  box-shadow: 0 0 0 3px var(--cms-accent-ring, rgba(46, 125, 50, 0.2));
}

.form-renderer__search-input::placeholder {
  color: var(--cms-ink-subtle);
}

.form-renderer__search-clear {
  position: absolute;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--cms-radius-control, 6px);
  background: transparent;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  line-height: 1;
  cursor: pointer;
  transition:
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.form-renderer__search-clear .material-icons-outlined {
  font-size: 16px;
}

@media (hover: hover) and (pointer: fine) {
  .form-renderer__search-clear:hover {
    color: var(--cms-ink, var(--cms-ink));
    background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  }
}

.form-renderer__search-clear:active {
  transform: scale(0.94);
}

.form-renderer__empty {
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-sm, 13px);
  padding: var(--cms-sp-3, 12px);
  border: 1px dashed var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-card, 10px);
  text-align: center;
}
</style>
