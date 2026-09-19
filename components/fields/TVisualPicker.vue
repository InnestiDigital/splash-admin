<template>
  <BaseField :field="field" type="visual-picker" :disabled="disabled">
    <div
      class="t-visual-picker"
      role="radiogroup"
      :aria-label="label"
      @keydown="handleKeydown"
    >
      <button
        v-for="(option, index) in (field.options || [])"
        :key="option.value"
        :ref="(el: any) => setOptionRef(el, Number(index))"
        type="button"
        role="radio"
        :disabled="disabled"
        :aria-checked="modelValue === option.value"
        :tabindex="disabled ? -1 : modelValue === option.value ? 0 : -1"
        :class="['t-visual-picker__option', { 'is-selected': modelValue === option.value }]"
        @click="selectOption(option.value)"
      >
        <div class="t-visual-picker__preview">
          <img
            v-if="option.image?.src"
            :src="option.image.src"
            :alt="option.image.alt || getOptionLabelText(option)"
            class="t-visual-picker__image"
            loading="lazy"
          />
          <span v-else class="t-visual-picker__placeholder">
            {{ getOptionLabelText(option)?.charAt(0)?.toUpperCase() }}
          </span>
        </div>
        <span class="t-visual-picker__label">{{ getOptionLabelText(option) }}</span>
      </button>
    </div>
  </BaseField>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseField from './BaseField.vue'
import { getLocalizedLabel, getOptionLabel } from '~/admin/utils/labelUtils'

const props = defineProps<{
  field: Record<string, any>
  modelValue?: string | number | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const optionRefs = ref<any[]>([])

function setOptionRef(el: any, index: number): void {
  optionRefs.value[index] = el
}

const label = computed(() => getLocalizedLabel(props.field?.label))

function getOptionLabelText(option: any): string {
  return getOptionLabel(option)
}

function selectOption(value: string | number) {
  if (props.disabled) return
  emit('update:modelValue', value)
}

function handleKeydown(event: KeyboardEvent) {
  if (props.disabled) return
  const options = props.field.options || []
  if (options.length === 0) return

  const currentIndex = options.findIndex((opt: any) => opt.value === props.modelValue)
  let newIndex = currentIndex

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      event.preventDefault()
      newIndex = (currentIndex + 1) % options.length
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      event.preventDefault()
      newIndex = (currentIndex - 1 + options.length) % options.length
      break
    case 'Home':
      event.preventDefault()
      newIndex = 0
      break
    case 'End':
      event.preventDefault()
      newIndex = options.length - 1
      break
    default:
      return
  }

  if (newIndex !== currentIndex) {
    const option = options[newIndex]
    if (!option) return
    selectOption(option.value)
    optionRefs.value[newIndex]?.focus()
  }
}
</script>

<style scoped>
.t-visual-picker {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cms-sp-3, 12px);
}

.t-visual-picker__option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cms-sp-2, 8px);
  min-width: 80px;
  min-height: 92px;
  padding: var(--cms-sp-3, 12px);
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: var(--cms-surface);
  font: inherit;
  cursor: pointer;
  touch-action: manipulation;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    box-shadow var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .t-visual-picker__option:not(.is-selected):not(:disabled):hover {
    border-color: var(--cms-line-hover, var(--cms-line-hover));
    background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  }
}

.t-visual-picker__option:focus-visible {
  outline: 2px solid var(--cms-accent, var(--cms-accent));
  outline-offset: 2px;
}

.t-visual-picker__option.is-selected {
  border-color: var(--cms-accent, var(--cms-accent));
  background: var(--cms-accent-softest, var(--cms-accent-softest));
  box-shadow: 0 0 0 2px var(--cms-accent-ring, rgba(46, 125, 50, 0.2));
}

.t-visual-picker__option:active:not(:disabled) {
  transform: scale(0.98);
}

.t-visual-picker__option:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.t-visual-picker__preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  border-radius: 4px;
  overflow: hidden;
}

.t-visual-picker__image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.t-visual-picker__placeholder {
  font-size: 20px;
  font-weight: 600;
  color: inherit;
}

.t-visual-picker__label {
  max-width: 80px;
  overflow: hidden;
  color: inherit;
  font-size: var(--cms-fs-caption, 12px);
  font-weight: 600;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.t-visual-picker__option.is-selected .t-visual-picker__label {
  color: var(--cms-accent-pressed, var(--cms-accent-pressed));
  font-weight: 700;
}
</style>
