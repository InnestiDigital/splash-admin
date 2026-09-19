<template>
  <BaseField :field="field" :type="field.type" :show-label="field.type !== 'checkbox' && field.type !== 'boolean'" :error="validationError" :disabled="disabled">
    <!-- Text Input -->
    <template v-if="field.type === 'text'">
      <input
        :id="field.id"
        type="text"
        :value="displayText"
        :placeholder="field.placeholder"
        :maxlength="field.validation?.maxLength"
        :pattern="field.validation?.pattern"
        :required="field.validation?.required"
        :disabled="disabled"
        v-bind="controlA11y"
        class="t-field__input"
        :class="{ 't-field__input--error': validationError }"
        @input="handleInput(($event.target as HTMLInputElement).value)"
        @blur="validateField()"
      />
      <div v-if="field.validation?.maxLength" class="t-field__char-count">
        {{ displayText.length }} / {{ field.validation.maxLength }}
      </div>
    </template>

    <!-- Textarea -->
    <template v-else-if="field.type === 'textarea'">
      <textarea
        :id="field.id"
        :value="displayText"
        :placeholder="field.placeholder"
        :maxlength="field.validation?.maxLength"
        :required="field.validation?.required"
        :rows="field.options?.rows || 4"
        :disabled="disabled"
        v-bind="controlA11y"
        class="t-field__textarea"
        :class="{ 't-field__textarea--error': validationError }"
        @input="handleInput(($event.target as HTMLTextAreaElement).value)"
        @blur="validateField()"
      ></textarea>
      <div v-if="field.validation?.maxLength" class="t-field__char-count">
        {{ displayText.length }} / {{ field.validation.maxLength }}
      </div>
    </template>

    <!-- Select -->
    <template v-else-if="field.type === 'select'">
      <select
        :id="field.id"
        :value="scalarValue"
        :disabled="disabled"
        v-bind="controlA11y"
        class="t-field__select"
        @change="updateValue(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="option in normalizedOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </template>

    <!-- Number (input mode) -->
    <template v-else-if="field.type === 'number'">
      <div class="t-number__input-wrap">
        <input
          :id="field.id"
          type="number"
          :value="scalarValue"
          :min="field.options?.min"
          :max="field.options?.max"
          :step="field.options?.step || 1"
          :disabled="disabled"
          v-bind="controlA11y"
          class="t-field__input t-field__input--number"
          @input="updateValue(parseFloat(($event.target as HTMLInputElement).value) || 0)"
        />
        <span v-if="field.options?.unit" class="t-number__unit">{{ field.options.unit }}</span>
      </div>
    </template>

    <!-- Range (slider mode) -->
    <template v-else-if="field.type === 'range'">
      <div class="t-number__range">
        <input
          :id="field.id"
          type="range"
          :value="scalarValue"
          :min="field.options?.min || 0"
          :max="field.options?.max || 100"
          :step="field.options?.step || 1"
          :list="field.options?.ticks ? `${field.id}-ticks` : undefined"
          :disabled="disabled"
          v-bind="controlA11y"
          class="t-number__slider"
          @input="updateValue(parseFloat(($event.target as HTMLInputElement).value))"
        />
        <span class="t-number__value">{{ scalarValue }}{{ field.options?.unit || '' }}</span>
        <datalist v-if="field.options?.ticks" :id="`${field.id}-ticks`">
          <option
            v-for="tick in field.options.ticks"
            :key="tick.value"
            :value="tick.value"
            :label="tick.label"
          />
        </datalist>
      </div>
    </template>

    <!-- Checkbox / Boolean -->
    <template v-else-if="field.type === 'checkbox' || field.type === 'boolean'">
      <label class="t-checkbox__label">
        <input
          type="checkbox"
          :checked="Boolean(modelValue)"
          :disabled="disabled"
          v-bind="controlA11y"
          class="t-checkbox__input"
          @change="updateValue(($event.target as HTMLInputElement).checked)"
        />
        <span class="t-checkbox__text">
          {{ checkboxLabel }}
          <span v-if="field.validation?.required" class="t-field__required">*</span>
        </span>
      </label>
    </template>

    <!-- Toggle (switch) -->
    <template v-else-if="field.type === 'toggle'">
      <label class="t-toggle__label">
        <span class="t-toggle__switch" :class="{ 't-toggle__switch--on': Boolean(modelValue) }">
          <input
            type="checkbox"
            :checked="Boolean(modelValue)"
            :disabled="disabled"
            v-bind="controlA11y"
            class="t-toggle__input"
            @change="updateValue(($event.target as HTMLInputElement).checked)"
          />
          <span class="t-toggle__track">
            <span class="t-toggle__thumb" />
          </span>
        </span>
        <span class="t-toggle__text">
          {{ checkboxLabel }}
          <span v-if="field.validation?.required" class="t-field__required">*</span>
        </span>
      </label>
    </template>

    <!-- Color Picker -->
    <!--
      "inherit" / "transparent" are transitional sentinel values for section-aware blocks.
      Future model: backgroundMode: 'section' | 'custom' | 'transparent' with color picker
      shown only in 'custom' mode. See SPL-006.
    -->
    <template v-else-if="field.type === 'color'">
      <div class="t-color__picker">
        <template v-if="isAutoColorValue">
          <button
            type="button"
            class="t-color__section-badge"
            :title="autoColorTitle"
            :disabled="disabled"
            @click="updateValue(explicitColorFallback)"
          >
            {{ autoColorLabel }}
          </button>
        </template>
        <template v-else>
          <input
            :id="field.id"
            type="color"
            :value="stringValue || '#000000'"
            :disabled="disabled"
            v-bind="controlA11y"
            class="t-color__input"
            @input="updateValue(($event.target as HTMLInputElement).value)"
          />
          <input
            type="text"
            :value="stringValue"
            :disabled="disabled"
            v-bind="controlA11y"
            placeholder="#000000"
            class="t-color__text"
            @input="updateValue(($event.target as HTMLInputElement).value)"
          />
          <button
            v-if="field.id === 'backgroundColor' || field.id === 'textColor'"
            type="button"
            class="t-color__inherit-btn"
            title="Reset to Auto (from section)"
            :disabled="disabled"
            @click="updateValue('inherit')"
          >
            ↩
          </button>
        </template>
      </div>
    </template>

    <!-- Font Family Picker -->
    <template v-else-if="field.type === 'font-family'">
      <select
        :id="field.id"
        :value="scalarValue"
        :disabled="disabled"
        v-bind="controlA11y"
        class="t-field__select"
        @change="updateValue(($event.target as HTMLSelectElement).value)"
      >
        <option value="">Select a font...</option>
        <option v-for="font in availableFonts" :key="font.value" :value="font.value">
          {{ font.label }}
        </option>
      </select>
    </template>

    <!-- URL Input -->
    <template v-else-if="field.type === 'url'">
      <div class="t-url__wrap">
        <input
          :id="field.id"
          type="url"
          :value="stringValue"
          :placeholder="field.placeholder"
          :required="field.validation?.required"
          :disabled="disabled"
          v-bind="controlA11y"
          class="t-field__input t-field__input--url"
          :class="{ 't-field__input--error': validationError }"
          @input="updateValue(($event.target as HTMLInputElement).value)"
          @blur="validateField()"
        />
        <button
          v-if="stringValue"
          type="button"
          class="t-url__open"
          title="Open in new tab"
          :disabled="disabled"
          @click="openUrl"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </button>
      </div>
    </template>

    <!-- Hidden: data-only field for custom editor panels -->
    <template v-else-if="field.type === 'hidden'">
      <!-- intentionally empty -->
    </template>

    <!-- Fallback: text input -->
    <template v-else>
      <input
        :id="field.id"
        type="text"
        :value="displayText"
        :placeholder="field.placeholder"
        :disabled="disabled"
        v-bind="controlA11y"
        class="t-field__input"
        @input="handleInput(($event.target as HTMLInputElement).value)"
      />
    </template>
  </BaseField>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import type { AriaAttributes, ComputedRef } from 'vue'
import BaseField from './BaseField.vue'
import { useTranslatableValue } from '~/admin/composables/useTranslatableValue'
import { getLocalizedLabel, getOptionLabel } from '~/admin/utils/labelUtils'
import { useEditorStore } from '~/admin/stores/editorStore'

const props = defineProps<{
  field: Record<string, any>
  modelValue?: string | number | boolean | Record<string, any> | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any]
  'validation-error': [fieldId: string, error: string | null]
}>()

// Inject the current editing locale from SettingsPanel (falls back to en-US)
const editingLocale = inject<ComputedRef<string>>('editingLocale')

// Inject theme manifest for font families
const themeManifest = inject<any>('themeManifest', null)

const editorStore = useEditorStore()

// Validation state
const validationError = ref<string | null>(null)
const hasValidated = ref(false)

const controlA11y = computed<Pick<AriaAttributes, 'aria-invalid' | 'aria-describedby'>>(() => {
  const id = String(props.field?.id || '')
  if (validationError.value) {
    return {
      'aria-invalid': true,
      'aria-describedby': `${id}-error`,
    }
  }

  const descriptions: string[] = []
  if (getLocalizedLabel(props.field?.helpText)) descriptions.push(`${id}-help`)
  if (getLocalizedLabel(props.field?.note)) descriptions.push(`${id}-note`)
  return {
    'aria-invalid': undefined,
    'aria-describedby': descriptions.length ? descriptions.join(' ') : undefined,
  }
})

// Translatable value handling (for text/textarea)
const { displayValue, handleInput } = useTranslatableValue(
  () => props.modelValue as any,
  () => props.field.translatable,
  (value) => {
    emit('update:modelValue', value)
    validateField(value)
  },
  () => editingLocale?.value || 'en-US',
)

const displayText = computed(() => typeof displayValue.value === 'string' ? displayValue.value : '')
const scalarValue = computed<string | number>(() =>
  typeof props.modelValue === 'string' || typeof props.modelValue === 'number'
    ? props.modelValue
    : '',
)
const stringValue = computed(() => typeof props.modelValue === 'string' ? props.modelValue : '')

// Normalized options for select
const normalizedOptions = computed(() => {
  const opts = props.field.options
  if (!opts) return []

  // source-based dynamic options
  if (!Array.isArray(opts) && typeof opts === 'object' && opts.source) {
    if (opts.source === 'pages') {
      const locale = editingLocale?.value || 'en-US'
      return editorStore.pages.map(page => ({
        value: page.slug,
        label: page.title?.[locale] || page.title?.['en-US'] || page.slug,
      }))
    }
    if (opts.source === 'blog-index-pages') {
      const locale = editingLocale?.value || 'en-US'
      return editorStore.pages
        .filter((page: any) => page.pageType === 'blog-index')
        .map((page: any) => ({
          value: page.id,
          label: page.title?.[locale] || page.title?.['en-US'] || page.slug,
        }))
    }
    return []
  }

  if (Array.isArray(opts)) {
    return opts.map((opt: any) => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt }
      }
      return {
        value: opt.value,
        label: getOptionLabel(opt) || opt.value,
      }
    })
  }

  return Object.entries(opts).map(([value, label]) => ({
    value,
    label: typeof label === 'string' ? label : value,
  }))
})

// Checkbox label
const checkboxLabel = computed(() => getLocalizedLabel(props.field?.label))

const supportsAutoColor = computed(() =>
  props.field?.id === 'backgroundColor'
  || props.field?.id === 'textColor'
  || props.field?.default === 'inherit'
  || props.field?.default === 'transparent',
)

const isAutoColorValue = computed(() =>
  supportsAutoColor.value
  && (props.modelValue === undefined
    || props.modelValue === null
    || props.modelValue === ''
    || props.modelValue === 'inherit'
    || props.modelValue === 'transparent'),
)

const explicitColorFallback = computed(() =>
  props.field?.default && props.field.default !== 'inherit' && props.field.default !== 'transparent'
    ? props.field.default
    : '#000000',
)

const autoColorTitle = computed(() =>
  props.modelValue === 'transparent'
    ? 'Transparent — sits on section background'
    : 'Auto (from section)',
)

const autoColorLabel = computed(() =>
  props.modelValue === 'transparent'
    ? '↩ Transparent'
    : '↩ Auto (from section)',
)

// Available fonts from theme manifest
const availableFonts = computed(() => {
  if (props.field.type !== 'font-family') return []

  // Extract font families from theme manifest typography.variants
  const variants = themeManifest?.value?.typography?.variants || themeManifest?.typography?.variants || []

  if (Array.isArray(variants)) {
    // Deduplicate by name and create options
    const uniqueFonts = new Map<string, string>()
    variants.forEach((variant: any) => {
      if (variant.name) {
        uniqueFonts.set(variant.name, variant.name)
      }
    })

    return Array.from(uniqueFonts.entries()).map(([value, label]) => ({
      value,
      label: formatFontName(label),
    }))
  }

  return []
})

function formatFontName(name: string): string {
  // Convert font-file-name to "Font File Name"
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// Open URL in new tab (used by url field type)
function openUrl() {
  if (props.modelValue) {
    window.open(String(props.modelValue), '_blank', 'noopener,noreferrer')
  }
}

function updateValue(value: any) {
  emit('update:modelValue', value)
  validateField(value)
}

function setValidationError(error: string | null) {
  validationError.value = error
  emit('validation-error', props.field.id, error)
}

function resolveCandidateValue(candidateValue: any): any {
  if (
    props.field.translatable
    && (props.field.type === 'text' || props.field.type === 'textarea')
    && candidateValue
    && typeof candidateValue === 'object'
    && !Array.isArray(candidateValue)
  ) {
    return candidateValue[editingLocale?.value || 'en-US'] ?? ''
  }
  return candidateValue
}

// Validation function. Input handlers pass their candidate value explicitly;
// Vue does not update model props until the parent render, so validating the
// prop here would otherwise leave the visible error and ARIA state one keystroke
// behind the control.
function validateField(candidateValue: any = props.modelValue) {
  hasValidated.value = true
  const validation = props.field.validation
  const valueToValidate = resolveCandidateValue(candidateValue)

  // Required validation
  if (validation?.required ?? props.field.required ?? false) {
    if (valueToValidate === null || valueToValidate === undefined || valueToValidate === '') {
      setValidationError('This field is required')
      return
    }
  }

  // String-based validations (for text/textarea)
  if (validation && typeof valueToValidate === 'string') {
    // Pattern validation
    if (validation.pattern) {
      let regex: RegExp
      try {
        regex = new RegExp(validation.pattern)
      } catch {
        setValidationError('Validation pattern is invalid')
        return
      }
      if (!regex.test(valueToValidate)) {
        setValidationError('Value does not match required pattern')
        return
      }
    }

    // Min length validation
    if (validation.minLength && valueToValidate.length < validation.minLength) {
      setValidationError(`Minimum length is ${validation.minLength} characters`)
      return
    }

    // Max length validation (should be caught by maxlength attribute, but double-check)
    if (validation.maxLength && valueToValidate.length > validation.maxLength) {
      setValidationError(`Maximum length is ${validation.maxLength} characters`)
      return
    }
  }

  if ((props.field.type === 'number' || props.field.type === 'range') && typeof valueToValidate === 'number') {
    const min = props.field.options?.min
    const max = props.field.options?.max
    if (typeof min === 'number' && valueToValidate < min) {
      setValidationError(`Value must be at least ${min}`)
      return
    }
    if (typeof max === 'number' && valueToValidate > max) {
      setValidationError(`Value must be at most ${max}`)
      return
    }
  }

  // URL format validation (runs regardless of validation config)
  if (props.field.type === 'url' && typeof valueToValidate === 'string' && valueToValidate !== '') {
    const isJavascript = /^javascript:/i.test(valueToValidate)
    const isRelative = /^[/#?]|^mailto:|^tel:/.test(valueToValidate)
    const isAbsolute = (() => {
      try { new URL(valueToValidate); return true }
      catch { return false }
    })()
    if (isJavascript || (!isRelative && !isAbsolute)) {
      setValidationError('Enter a valid URL (e.g. https://example.com or /page)')
      return
    }
  }

  // Clear error if all validations pass
  setValidationError(null)
}

// Keep touched controls in sync when their value or editing locale is changed
// externally (undo/redo, auth tab switch, or a parent normalization pass).
watch(
  [() => props.modelValue, () => editingLocale?.value],
  () => {
    if (hasValidated.value) validateField()
  },
  { deep: true },
)

// Expose validation function for parent components
defineExpose({
  validate: validateField,
  hasError: computed(() => !!validationError.value),
})
</script>

<style scoped>
.t-field__textarea {
  resize: vertical;
  font-family: inherit;
}

.t-field__select {
  cursor: pointer;
}

.t-field__input--error,
.t-field__textarea--error {
  border-color: var(--cms-danger, var(--cms-danger)) !important;
  background: var(--cms-danger-soft, var(--cms-danger-soft)) !important;
}

.t-field__char-count {
  margin-top: var(--cms-sp-1, 4px);
  color: var(--cms-ink-subtle);
  font-size: var(--cms-fs-caption, 12px);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.t-number__input-wrap {
  display: flex;
  align-items: center;
  gap: var(--cms-sp-2, 8px);
}

.t-field__input--number {
  width: 120px;
}

.t-number__unit {
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-sm, 13px);
}

.t-number__range {
  display: flex;
  align-items: center;
  gap: var(--cms-sp-3, 12px);
}

.t-number__slider {
  flex: 1;
  min-width: 80px;
  accent-color: var(--cms-accent, var(--cms-accent));
  cursor: pointer;
}

.t-number__value {
  min-width: 60px;
  text-align: right;
  color: var(--cms-ink-body, var(--cms-ink-body));
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--cms-fs-sm, 13px);
  font-variant-numeric: tabular-nums;
}

.t-checkbox__label {
  display: flex;
  align-items: center;
  gap: var(--cms-sp-2, 8px);
  margin: 0;
  cursor: pointer;
}

.t-checkbox__input {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--cms-accent, var(--cms-accent));
  cursor: pointer;
}

.t-checkbox__text {
  color: var(--cms-ink-body, var(--cms-ink-body));
  font-size: var(--cms-fs-body, 14px);
}

.t-field__required {
  color: var(--cms-danger, var(--cms-danger));
}

.t-toggle__label {
  display: flex;
  align-items: center;
  gap: var(--cms-sp-2, 8px);
  margin: 0;
  cursor: pointer;
}

.t-toggle__switch {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
}

.t-toggle__input {
  position: absolute;
  opacity: 0;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

.t-toggle__track {
  display: block;
  position: relative;
  width: 40px;
  height: 22px;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-pill, 999px);
  background: var(--cms-surface-sunken, var(--cms-surface-sunken));
  box-shadow: inset 0 1px 2px rgba(33, 30, 25, 0.08);
  pointer-events: none;
  transition:
    background-color var(--cms-motion-normal, 180ms) var(--cms-ease-out, ease-out),
    border-color var(--cms-motion-normal, 180ms) var(--cms-ease-out, ease-out),
    box-shadow var(--cms-motion-normal, 180ms) var(--cms-ease-out, ease-out);
}

.t-toggle__input:focus-visible + .t-toggle__track {
  box-shadow: 0 0 0 3px var(--cms-accent-ring, rgba(46, 125, 50, 0.2));
}

.t-toggle__switch--on .t-toggle__track {
  border-color: var(--cms-accent, var(--cms-accent));
  background: var(--cms-accent, var(--cms-accent));
}

.t-toggle__thumb {
  display: block;
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--cms-surface);
  box-shadow: 0 1px 3px rgba(33, 30, 25, 0.28);
  transition: transform var(--cms-motion-normal, 180ms) var(--cms-ease-out, ease-out);
}

.t-toggle__switch--on .t-toggle__thumb {
  transform: translateX(18px);
}

.t-toggle__text {
  color: var(--cms-ink-body, var(--cms-ink-body));
  font-size: var(--cms-fs-body, 14px);
}

.t-color__picker {
  display: flex;
  align-items: center;
  gap: var(--cms-sp-2, 8px);
  min-width: 0;
}

.t-color__input {
  flex: 0 0 auto;
  width: 44px;
  height: var(--cms-density-md, 40px);
  padding: 3px;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  background: var(--cms-surface);
  cursor: pointer;
}

.t-color__text {
  min-width: 0;
  flex: 1;
  height: var(--cms-density-md, 40px);
  padding: 0 var(--cms-sp-3, 12px);
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: var(--cms-surface);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--cms-fs-sm, 13px);
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    box-shadow var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.t-color__text:focus {
  outline: none;
  border-color: var(--cms-accent, var(--cms-accent));
  box-shadow: 0 0 0 3px var(--cms-accent-ring, rgba(46, 125, 50, 0.2));
}

.t-color__section-badge {
  display: inline-flex;
  align-items: center;
  min-height: var(--cms-density-sm, 34px);
  gap: var(--cms-sp-1, 4px);
  padding: 0 var(--cms-sp-3, 12px);
  border: 1px dashed var(--cms-accent, var(--cms-accent));
  border-radius: var(--cms-radius-control, 6px);
  background: var(--cms-accent-softest, var(--cms-accent-softest));
  color: var(--cms-accent-pressed, var(--cms-accent-pressed));
  font-size: var(--cms-fs-sm, 13px);
  cursor: pointer;
  transition:
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .t-color__section-badge:hover {
    background: var(--cms-accent-soft, var(--cms-accent-soft));
  }
}

.t-color__section-badge:active {
  transform: scale(0.98);
}

.t-color__inherit-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  background: var(--cms-surface);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: 16px;
  cursor: pointer;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .t-color__inherit-btn:hover {
    border-color: var(--cms-accent, var(--cms-accent));
    color: var(--cms-accent, var(--cms-accent));
    background: var(--cms-accent-softest, var(--cms-accent-softest));
  }
}

.t-color__inherit-btn:active {
  transform: scale(0.94);
}

.t-field__helper {
  margin: var(--cms-sp-1, 4px) 0 0;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-caption, 12px);
  line-height: 1.45;
  font-style: italic;
}

.t-url__wrap {
  display: flex;
  align-items: center;
  gap: var(--cms-sp-2, 8px);
}

.t-url__wrap .t-field__input--url {
  flex: 1;
}

.t-url__open {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  background: var(--cms-surface);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  cursor: pointer;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .t-url__open:hover {
    border-color: var(--cms-accent, var(--cms-accent));
    color: var(--cms-accent, var(--cms-accent));
    background: var(--cms-accent-softest, var(--cms-accent-softest));
  }
}

.t-url__open:active {
  transform: scale(0.94);
}
</style>
