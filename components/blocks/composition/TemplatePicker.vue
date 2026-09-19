<template>
  <div class="template-picker">
    <h3 class="template-picker__title">Template</h3>
    <div class="template-picker__grid">
      <button
        v-for="tpl in templates"
        :key="tpl.id"
        class="template-picker__card"
        :class="{ 'template-picker__card--selected': tpl.id === modelValue }"
        @click="$emit('update:modelValue', tpl.id)"
      >
        <span class="template-picker__icon">{{ iconFor(tpl.id) }}</span>
        <span class="template-picker__label">{{ tpl.label['en-US'] || tpl.id }}</span>
        <span class="template-picker__desc">{{ tpl.description['en-US'] || '' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getAllTemplates } from '~/shared/features/cms/composition/templates'

defineProps<{ modelValue: string }>()
defineEmits<{ 'update:modelValue': [value: string] }>()

const templates = getAllTemplates()

function iconFor(id: string): string {
  switch (id) {
    case 'asymmetric-hero': return '◧'
    case 'offset-media-stack': return '⧉'
    case 'captioned-editorial-spread': return '☰'
    default: return '□'
  }
}
</script>

<style lang="scss" scoped>
.template-picker {
  margin-bottom: 1rem;

  &__title {
    font-size: 0.8125rem;
    font-weight: 600;
    margin: 0 0 0.5rem;
    color: var(--cms-ink-subtle);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  &__card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem 0.5rem;
    border: 2px solid var(--cms-line);
    border-radius: 8px;
    background: var(--cms-surface);
    cursor: pointer;
    transition: border-color 0.15s;
    text-align: center;

    &:hover { border-color: var(--cms-accent); }
    &--selected {
      border-color: var(--cms-accent);
      background: var(--cms-accent-soft);
    }
  }

  &__icon { font-size: 1.5rem; color: var(--cms-ink-subtle); }
  &__label { font-size: 0.75rem; font-weight: 600; }
  &__desc { font-size: 0.625rem; color: var(--cms-ink-subtle); }
}
</style>
