<template>
  <div class="preset-picker">
    <!-- Category filter strip — only shown when 2+ categories present -->
    <div v-if="availableCategories.length > 1" class="preset-picker__filters">
      <button
        class="preset-picker__filter"
        :class="{ 'preset-picker__filter--active': activeCategory === null }"
        @click="activeCategory = null"
      >All</button>
      <button
        v-for="cat in availableCategories"
        :key="cat"
        class="preset-picker__filter"
        :class="{ 'preset-picker__filter--active': activeCategory === cat }"
        @click="activeCategory = cat"
      >{{ categoryLabel(cat) }}</button>
    </div>

    <!-- Default (no preset) option -->
    <button v-if="allowDefault !== false" class="preset-btn preset-btn--default" @click="emit('select', null)">
      <span class="preset-btn__name">Default (no preset)</span>
      <span class="preset-btn__desc">Use schema defaults</span>
    </button>

    <!-- Preset list -->
    <button
      v-for="(preset, index) in filtered"
      :key="index"
      class="preset-btn"
      :class="{ 'preset-btn--default-preset': preset.isDefault }"
      @click="emit('select', preset)"
    >
      <div class="preset-btn__header">
        <span class="preset-btn__name">{{ getPresetLabel(preset) || `Preset ${index + 1}` }}</span>
        <span v-if="preset.isDefault" class="preset-btn__badge">default</span>
      </div>
      <span v-if="getPresetDescription(preset)" class="preset-btn__desc">
        {{ getPresetDescription(preset) }}
      </span>
    </button>

    <p v-if="filtered.length === 0" class="preset-picker__empty">
      No presets in this category.
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { BlockPreset } from '~/shared/types/blocks'
import { getPresetLabel, getPresetDescription } from '~/admin/utils/labelUtils'

const props = defineProps<{
  presets: BlockPreset[]
  /** Surfaces that apply a preset onto existing settings have no "reset" semantics. */
  allowDefault?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', preset: BlockPreset | null): void
}>()

type Category = BlockPreset['category']

const activeCategory = ref<Category | null>(null)

const availableCategories = computed<Category[]>(() => {
  const cats = new Set<Category>()
  for (const p of props.presets) {
    if (p.category) cats.add(p.category)
  }
  return [...cats]
})

const filtered = computed(() => {
  if (!activeCategory.value) return props.presets
  return props.presets.filter(p => p.category === activeCategory.value)
})

const CATEGORY_LABELS: Record<string, string> = {
  hero: 'Hero',
  cta: 'CTA',
  editorial: 'Editorial',
  media: 'Media',
  product: 'Product',
  marketing: 'Marketing',
  layout: 'Layout',
  utility: 'Utility',
}

function categoryLabel(cat: Category): string {
  return cat ? (CATEGORY_LABELS[cat] ?? cat) : ''
}
</script>

<style scoped>
.preset-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* Category filter strip */
.preset-picker__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--cms-line);
  margin-bottom: 2px;
}

.preset-picker__filter {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid var(--cms-line);
  border-radius: 12px;
  background: white;
  cursor: pointer;
  color: var(--cms-ink-body);
  transition: background-color var(--cms-motion-fast) var(--cms-ease-out), border-color var(--cms-motion-fast) var(--cms-ease-out), color var(--cms-motion-fast) var(--cms-ease-out);
}

.preset-picker__filter:hover {
  border-color: var(--cms-accent);
  color: var(--cms-accent);
}

.preset-picker__filter--active {
  background: var(--cms-accent);
  border-color: var(--cms-accent);
  color: white;
}

/* Preset buttons */
.preset-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding: 10px 12px;
  background: var(--cms-surface-subtle);
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 0.15s, border-color 0.15s;
}

.preset-btn:hover {
  background: var(--cms-line);
  border-color: var(--cms-accent);
}

.preset-btn--default {
  opacity: 0.75;
  font-style: italic;
}

.preset-btn--default-preset {
  border-left: 3px solid var(--cms-accent);
}

.preset-btn__header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.preset-btn__name {
  font-size: 14px;
  font-weight: 500;
  flex: 1;
}

.preset-btn__badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  background: rgba(0, 102, 255, 0.1);
  color: var(--cms-accent);
  padding: 2px 6px;
  border-radius: 3px;
  flex-shrink: 0;
}

.preset-btn__desc {
  font-size: 12px;
  color: var(--cms-ink-muted);
  line-height: 1.4;
}

.preset-picker__empty {
  font-size: 13px;
  color: var(--cms-ink-subtle);
  font-style: italic;
  text-align: center;
  padding: 12px 0;
}
</style>
