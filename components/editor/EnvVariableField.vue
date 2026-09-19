<template>
  <div class="env-field">
    <div class="env-field__header">
      <label class="env-field__label">
        {{ getLocalizedLabel(schema.label) }}
      </label>
      <span v-if="isDefault" class="env-field__default">default</span>
    </div>

    <!-- Boolean -->
    <label v-if="schema.type === 'boolean'" class="env-field__checkbox-label">
      <input
        type="checkbox"
        :checked="modelValue"
        @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
      />
      <span>{{ getLocalizedLabel(schema.label) }}</span>
    </label>

    <!-- Number -->
    <input
      v-else-if="schema.type === 'number'"
      type="number"
      class="env-field__input"
      :value="modelValue"
      @input="$emit('update:modelValue', parseFloat(($event.target as HTMLInputElement).value) || 0)"
    />

    <!-- Text (default) -->
    <input
      v-else
      type="text"
      class="env-field__input"
      :value="modelValue ?? ''"
      :placeholder="schema.default != null ? `Default: ${schema.default}` : ''"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />

    <p v-if="schema.description" class="env-field__description">
      {{ schema.description }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getLocalizedLabel } from '~/admin/utils/labelUtils'

const props = defineProps<{
  schema: {
    id: string
    type: string
    label: Record<string, string>
    default?: any
    description?: string
  }
  modelValue?: any
}>()

defineEmits<{
  'update:modelValue': [value: any]
}>()

const isDefault = computed(() => {
  return props.schema.default !== undefined && props.modelValue === props.schema.default
})
</script>

<style scoped>
.env-field {
  padding: 12px 0;
  border-bottom: 1px solid var(--cms-surface-subtle);
}

.env-field:last-child {
  border-bottom: none;
}

.env-field__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.env-field__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--cms-ink-body);
}

.env-field__default {
  font-size: 10px;
  color: var(--cms-ink-muted);
  background: var(--cms-surface-subtle);
  padding: 1px 6px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.env-field__input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  font-size: 14px;
}

.env-field__input:focus {
  outline: none;
  border-color: var(--cms-accent);
}

.env-field__checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
}

.env-field__description {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--cms-ink-subtle);
}
</style>
