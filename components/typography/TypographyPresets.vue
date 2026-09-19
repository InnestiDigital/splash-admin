<template>
  <div class="typography-presets">
    <div class="typography-presets__table">
      <PresetTable
        :presets="presets"
        :selected-preset-id="selectedPresetId"
        :saving="saving"
        :unused-keys="unusedKeys"
        @select="emit('select', $event)"
        @create="emit('create')"
        @duplicate="emit('duplicate', $event)"
        @reorder="handleReorder"
      />
    </div>

    <div class="typography-presets__editor">
      <PresetEditor
        v-if="selectedPreset"
        :preset="selectedPreset"
        :font-variants="fontVariants"
        :saving="saving"
        :fetch-usage="fetchUsage"
        @save="handleSave"
        @delete="emit('delete', $event)"
        @dirty-change="emit('dirtyChange', $event)"
      />

      <section v-else class="typography-presets__empty cms-card">
        <div class="cms-card__body">
          <span class="material-icons-outlined typography-presets__empty-icon">text_format</span>
          <h3>Select a preset</h3>
          <p>Choose a preset from the left to edit it, or create a new one.</p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PresetEditor from '~/admin/components/typography/PresetEditor.vue'
import PresetTable from '~/admin/components/typography/PresetTable.vue'
import type {
  PresetCategory,
  PresetUsage,
  TypographyPreset,
  UpdatePresetDto,
} from '~/server/services/typography/typographyTypes'
import type { ThemeVariant } from '~/shared/typography/axisResolution'

const props = withDefaults(defineProps<{
  presets: TypographyPreset[]
  selectedPresetId: string | null
  saving: boolean
  fontVariants: ThemeVariant[]
  fetchUsage: (presetId: string) => Promise<PresetUsage>
  /** Preset keys flagged `unused-preset` by the diagnostics endpoint. */
  unusedKeys?: string[]
}>(), {
  unusedKeys: () => [],
})

const emit = defineEmits<{
  select: [id: string]
  create: []
  update: [id: string, dto: UpdatePresetDto]
  delete: [id: string]
  duplicate: [id: string]
  reorder: [category: PresetCategory, orderedIds: string[]]
  dirtyChange: [dirty: boolean]
}>()

const selectedPreset = computed(() => props.presets.find(preset => preset.id === props.selectedPresetId) ?? null)

function handleSave(id: string, dto: UpdatePresetDto) {
  emit('update', id, dto)
}

function handleReorder(category: PresetCategory, orderedIds: string[]) {
  emit('reorder', category, orderedIds)
}
</script>

<style scoped lang="scss">
.typography-presets {
  display: grid;
  // Table column: at least 24rem, grows up to 1/4 of remaining space.
  // Editor column takes the rest (3/4 max).
  grid-template-columns: minmax(24rem, 1fr) minmax(0, 3fr);
  gap: 2rem;
  align-items: start;
}

.typography-presets__table,
.typography-presets__editor {
  min-width: 0; // allow grid children to shrink below content size
}

.typography-presets__empty {
  min-height: 36rem;
}

.typography-presets__empty :deep(.cms-card__body) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 36rem;
  text-align: center;
  color: var(--cms-ink-muted);
}

.typography-presets__empty-icon {
  margin-bottom: 1rem;
  font-size: 4rem;
}
</style>
