<template>
  <section class="preset-table cms-card">
    <div class="cms-card__header preset-table__header">
      <h3 class="cms-card__title">Presets</h3>
      <button
        type="button"
        class="cms-btn cms-btn--primary cms-btn--sm"
        data-action="create"
        :disabled="saving"
        @click="emit('create')"
      >
        Create Preset
      </button>
    </div>

    <div class="cms-card__body preset-table__body">
      <div v-if="presets.length === 0" class="preset-table__empty">
        No presets yet.
      </div>

      <section
        v-for="category in PRESET_CATEGORIES"
        :key="category"
        class="preset-table__group"
      >
        <template v-if="presetsByCategory[category]?.length">
          <header class="preset-table__group-header">
            <span>{{ formatCategoryLabel(category) }}</span>
            <span>{{ presetsByCategory[category]!.length }}</span>
          </header>

          <div class="preset-table__list">
            <div
              v-for="preset in presetsByCategory[category]"
              :key="preset.id"
              :data-preset-id="preset.id"
              class="preset-table__item"
              :class="{
                'preset-table__item--selected': selectedPresetId === preset.id,
                'table-active': selectedPresetId === preset.id,
              }"
              @click="emit('select', preset.id)"
            >
              <div class="preset-table__reorder-controls" @click.stop>
                <button
                  type="button"
                  class="preset-table__icon-button"
                  title="Move up"
                  :disabled="saving || isFirstInCategory(preset)"
                  @click="movePreset(preset, -1)"
                >
                  <span class="material-icons-outlined">arrow_upward</span>
                </button>
                <button
                  type="button"
                  class="preset-table__icon-button"
                  title="Move down"
                  :disabled="saving || isLastInCategory(preset)"
                  @click="movePreset(preset, 1)"
                >
                  <span class="material-icons-outlined">arrow_downward</span>
                </button>
              </div>

              <div class="preset-table__content">
                <div class="preset-table__topline">
                  <div class="preset-table__name" :title="preset.name">{{ preset.name }}</div>
                  <button
                    type="button"
                    class="preset-table__copy-button"
                    title="Duplicate"
                    :disabled="saving"
                    @click.stop="emit('duplicate', preset.id)"
                  >
                    <span class="material-icons-outlined">content_copy</span>
                  </button>
                </div>
                <div class="preset-table__subline">
                  <span class="preset-table__meta" :title="preset.key">{{ preset.key }}</span>
                  <!-- An active preset bound to no role and referenced by no block
                       or rich text renders nowhere on the site. That was only
                       discoverable by opening the Diagnostics tab and reading an
                       "info" line, so authors edited presets that could not
                       possibly change the page. -->
                  <span
                    v-if="unusedKeys.includes(preset.key) && preset.isActive"
                    class="preset-table__unused"
                    title="Active, but no role, block, or rich text uses this preset — it does not appear on the site."
                  >
                    Unused
                  </span>
                  <span
                    class="preset-table__status"
                    :class="preset.isActive ? 'preset-table__status--active' : 'preset-table__status--inactive'"
                  >
                    <span class="preset-table__status-dot" />
                  </span>
                </div>
                <div class="preset-table__sample" :style="sampleStyle(preset)">
                  Aa Bb Cc 0123
                </div>
              </div>
            </div>
          </div>
        </template>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  PRESET_CATEGORIES,
  type PresetCategory,
  type TypographyPreset,
} from '~/server/services/typography/typographyTypes'

const props = withDefaults(defineProps<{
  presets: TypographyPreset[]
  selectedPresetId: string | null
  saving: boolean
  /** Preset keys the `unused-preset` diagnostic flagged. Derived server-side by
   *  shared/typography/diagnose.ts, so this list stays the single source of
   *  truth for "does this preset actually render anywhere". */
  unusedKeys?: string[]
}>(), {
  unusedKeys: () => [],
})

const emit = defineEmits<{
  select: [id: string]
  create: []
  duplicate: [id: string]
  reorder: [category: PresetCategory, orderedIds: string[]]
}>()

const presetsByCategory = computed(() => {
  const grouped = {} as Record<PresetCategory, TypographyPreset[]>
  for (const category of PRESET_CATEGORIES) {
    grouped[category] = props.presets
      .filter(preset => preset.category === category)
      .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name))
  }
  return grouped
})

function formatCategoryLabel(category: string): string {
  return category.replace(/([A-Z])/g, ' $1').replace(/^./, character => character.toUpperCase())
}

function isFirstInCategory(preset: TypographyPreset): boolean {
  const group = presetsByCategory.value[preset.category]
  return group[0]?.id === preset.id
}

function isLastInCategory(preset: TypographyPreset): boolean {
  const group = presetsByCategory.value[preset.category]
  return group[group.length - 1]?.id === preset.id
}

function movePreset(preset: TypographyPreset, direction: -1 | 1) {
  const group = presetsByCategory.value[preset.category]
  const orderedIds = group.map(item => item.id)
  const currentIndex = orderedIds.indexOf(preset.id)
  const nextIndex = currentIndex + direction

  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedIds.length) return

  ;[orderedIds[currentIndex], orderedIds[nextIndex]] = [orderedIds[nextIndex], orderedIds[currentIndex]]
  emit('reorder', preset.category, orderedIds)
}

function sampleStyle(preset: TypographyPreset): Record<string, string> {
  const style: Record<string, string> = {}
  if (preset.fontFamily) style.fontFamily = preset.fontFamily.includes(' ') ? `'${preset.fontFamily}'` : preset.fontFamily
  if (preset.fontWeight !== null) style.fontWeight = String(preset.fontWeight)
  if (preset.textTransform) style.textTransform = preset.textTransform
  if (preset.color) style.color = preset.color
  return style
}
</script>

<style scoped lang="scss">
.preset-table {
  height: 100%;
}

.preset-table__header {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.8rem;
}

.preset-table__header .cms-card__title {
  margin: 0;
}

.preset-table__header .cms-btn {
  align-self: flex-start;
}

.preset-table__body {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
}

.preset-table__empty {
  padding: 2rem 0;
  color: var(--cms-ink-subtle);
  text-align: center;
}

.preset-table__group {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.preset-table__group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--cms-ink-body);
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.preset-table__list {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.preset-table__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.8rem;
  align-items: center;
  padding: 0.8rem 1rem;
  border: 1px solid var(--cms-line);
  border-radius: 0.2rem;
  background: var(--cms-surface);
  cursor: pointer;
}

.preset-table__item--selected {
  background: var(--cms-canvas);
  border-color: #d9e9da;
  box-shadow: inset 3px 0 0 var(--cms-accent);
}

.preset-table__content {
  min-width: 0;
}

.preset-table__reorder-controls {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.preset-table__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--cms-line);
  border-radius: 0.2rem;
  background: var(--cms-surface);
  color: var(--cms-ink-body);
  transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
}

.preset-table__icon-button .material-icons-outlined {
  font-size: 1.4rem;
}

.preset-table__icon-button:hover:not(:disabled) {
  border-color: #d8e6d9;
  background: var(--cms-canvas);
  color: var(--cms-accent);
}

.preset-table__icon-button:disabled {
  opacity: 0.4;
}

.preset-table__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.2rem;
}

.preset-table__name {
  font-weight: 600;
  font-size: 1.3rem;
  color: var(--cms-ink-body);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.preset-table__subline {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.2rem;
}

.preset-table__meta {
  color: var(--cms-ink-subtle);
  font-size: 1.1rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.preset-table__unused {
  flex-shrink: 0;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: var(--cms-warn-soft);
  color: var(--cms-warn);
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.preset-table__copy-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 0;
  background: transparent;
  color: var(--cms-accent);
  flex-shrink: 0;
}

.preset-table__copy-button:hover:not(:disabled) {
  background: var(--cms-canvas);
}

.preset-table__copy-button .material-icons-outlined {
  font-size: 1.5rem;
}

.preset-table__copy-button:disabled {
  color: var(--cms-ink-subtle);
}

.preset-table__status {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.preset-table__status-dot {
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 999px;
  background: currentColor;
}

.preset-table__status--active {
  color: var(--cms-accent);
}

.preset-table__status--inactive {
  color: var(--cms-ink-subtle);
}

.preset-table__sample {
  color: var(--cms-ink-body);
  margin-top: 0.6rem;
  font-size: 1.3rem;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

</style>
