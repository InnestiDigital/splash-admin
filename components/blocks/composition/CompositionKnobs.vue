<template>
  <div class="composition-knobs">
    <h3 class="composition-knobs__title">Composition</h3>
    <div v-for="knob in knobDefs" :key="knob.key" class="composition-knobs__row">
      <label>{{ knob.label }}</label>
      <div class="composition-knobs__segmented">
        <button
          v-for="opt in knob.options"
          :key="opt"
          :class="{ active: (modelValue as any)[knob.key] === opt }"
          @click="update(knob.key, opt)"
        >{{ opt }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CompositionKnobs } from '~/shared/features/cms/composition/types'

const props = defineProps<{ modelValue: CompositionKnobs }>()
const emit = defineEmits<{ 'update:modelValue': [value: CompositionKnobs] }>()

const knobDefs = [
  { key: 'dominance', label: 'Dominance', options: ['media', 'balanced', 'text'] },
  { key: 'overlap', label: 'Overlap', options: ['tight', 'normal', 'spacious'] },
  { key: 'alignment', label: 'Alignment', options: ['left', 'balanced', 'right'] },
  { key: 'density', label: 'Density', options: ['airy', 'normal', 'dense'] },
]

function update(key: string, value: string) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<style lang="scss" scoped>
.composition-knobs {
  &__title {
    font-size: 0.8125rem;
    font-weight: 600;
    margin: 1rem 0 0.5rem;
    color: var(--cms-ink-subtle);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    label { font-size: 0.8125rem; }
  }

  &__segmented {
    display: flex;
    border: 1px solid var(--cms-line);
    border-radius: 6px;
    overflow: hidden;
    button {
      padding: 0.25rem 0.5rem;
      font-size: 0.6875rem;
      border: none;
      background: var(--cms-surface);
      cursor: pointer;
      text-transform: capitalize;
      border-right: 1px solid var(--cms-line);
      &:last-child { border-right: none; }
      &:hover { background: var(--cms-surface-subtle); }
      &.active { background: var(--cms-accent); color: white; }
    }
  }
}
</style>
