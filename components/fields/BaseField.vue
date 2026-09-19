<template>
  <div class="t-field" :class="[`t-field--${fieldType}`, { 't-field--disabled': disabled }]">
    <label v-if="labelVisible" :for="fieldId" class="t-field__label">
      {{ fieldLabel }}
      <span v-if="isRequired" class="t-field__required">*</span>
    </label>
    <slot></slot>
    <p v-if="error" :id="`${fieldId}-error`" class="t-field__error">{{ error }}</p>
    <p v-if="fieldHelpText && !error" :id="`${fieldId}-help`" class="t-field__note">{{ fieldHelpText }}</p>
    <p v-if="fieldNote && !error" :id="`${fieldId}-note`" class="t-field__note">{{ fieldNote }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getLocalizedLabel } from '~/admin/utils/labelUtils'

const props = withDefaults(
  defineProps<{
    field: Record<string, any> | null
    type?: string
    showLabel?: boolean
    error?: string | null
    disabled?: boolean
  }>(),
  { showLabel: true },
)

const fieldId = computed(() => props.field?.id || '')
const fieldLabel = computed(() => getLocalizedLabel(props.field?.label))
const fieldHelpText = computed(() => getLocalizedLabel(props.field?.helpText))
const fieldNote = computed(() => getLocalizedLabel(props.field?.note))
const isRequired = computed(() => props.field?.validation?.required || false)
const labelVisible = computed(() => props.showLabel !== false)
const fieldType = computed(() => props.type || 'text')
</script>

<style scoped>
.t-field {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.t-field__label {
  margin: 0 0 var(--cms-sp-2, 8px);
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-sm, 13px);
  font-weight: 600;
  line-height: 1.35;
}

.t-field__required {
  color: var(--cms-danger, var(--cms-danger));
}

.t-field__note {
  margin: var(--cms-sp-1, 4px) 0 0;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-caption, 12px);
  line-height: 1.5;
}

.t-field__error {
  margin: var(--cms-sp-1, 4px) 0 0;
  color: var(--cms-danger, var(--cms-danger));
  font-size: var(--cms-fs-caption, 12px);
  line-height: 1.5;
}

.t-field :deep(.t-field__input),
.t-field :deep(.t-field__select),
.t-field :deep(.t-field__textarea) {
  width: 100%;
  min-height: var(--cms-density-md, 40px);
  padding: 9px var(--cms-sp-3, 12px);
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: var(--cms-surface);
  font-family: inherit;
  font-size: var(--cms-fs-body, 14px);
  line-height: 1.45;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    box-shadow var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.t-field :deep(.t-field__select) {
  appearance: none;
  padding-right: 38px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%236e6659' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 16px;
}

@media (hover: hover) and (pointer: fine) {
  .t-field :deep(.t-field__input:hover:not(:disabled)),
  .t-field :deep(.t-field__select:hover:not(:disabled)),
  .t-field :deep(.t-field__textarea:hover:not(:disabled)) {
    border-color: var(--cms-line-hover, var(--cms-line-hover));
  }
}

.t-field :deep(.t-field__input:focus),
.t-field :deep(.t-field__select:focus),
.t-field :deep(.t-field__textarea:focus) {
  outline: none;
  border-color: var(--cms-accent, var(--cms-accent));
  box-shadow: 0 0 0 3px var(--cms-accent-ring, rgba(46, 125, 50, 0.2));
}

.t-field--disabled {
  opacity: 0.62;
  pointer-events: none;
}
</style>
