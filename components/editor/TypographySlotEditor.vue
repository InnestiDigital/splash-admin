<!-- admin/components/editor/TypographySlotEditor.vue -->
<template>
  <TGroup label="Typography" :collapsible="true">
    <div
      v-for="slot in slots"
      :key="slot.slot"
      class="typography-slot-row"
    >
      <label class="typography-slot-row__label">{{ slot.label }}</label>
      <select
        class="typography-slot-row__select"
        :value="settings[slotToSettingsKey(slot.slot)] ?? ''"
        @change="onSlotChange(slot.slot, ($event.target as HTMLSelectElement).value)"
      >
        <option value="">
          Theme default{{ inheritedLabel(slot) }}
        </option>
        <optgroup
          v-for="group in groupedPresets"
          :key="group.category"
          :label="group.category"
        >
          <option
            v-for="preset in group.presets"
            :key="preset.key"
            :value="preset.key"
          >
            {{ preset.name }}
          </option>
        </optgroup>
      </select>
    </div>
  </TGroup>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TGroup from '~/admin/components/fields/TGroup.vue'
import { slotToSettingsKey, resolveInheritedLabel } from '~/shared/typography/typographySlots'
import type { TypographySlotSchema } from '~/shared/typography/typographySlots'
import type { TypographyPreset, TypographySnapshotRoles } from '~/server/services/typography/typographyTypes'

const props = defineProps<{
  slots: TypographySlotSchema[]
  settings: Record<string, any>
  presets: TypographyPreset[]
  roles: TypographySnapshotRoles
}>()

const emit = defineEmits<{
  'update:settings': [settings: Record<string, any>]
}>()

// Filter to active + block-override-eligible presets, grouped by category
const groupedPresets = computed(() => {
  const eligible = props.presets.filter(
    p => p.isActive && p.isBlockOverrideEligible,
  )

  const groups = new Map<string, TypographyPreset[]>()
  for (const preset of eligible) {
    const cat = preset.category || 'other'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(preset)
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, presets]) => ({
      category,
      presets: presets.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name)),
    }))
})

function inheritedLabel(slot: TypographySlotSchema): string {
  const result = resolveInheritedLabel(slot, props.roles, props.presets)
  if (result.isUnmapped) return ' — Unassigned'
  return ` — ${result.presetName}`
}

function onSlotChange(slot: string, value: string) {
  const key = slotToSettingsKey(slot)
  emit('update:settings', {
    ...props.settings,
    [key]: value || null,
  })
}
</script>

<style scoped>
.typography-slot-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.typography-slot-row__label {
  flex: 0 0 100px;
  font-size: 13px;
  color: var(--cms-ink-body);
}

.typography-slot-row__select {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--cms-line-strong);
  border-radius: 4px;
  font-size: 13px;
  background: var(--cms-surface);
}
</style>
