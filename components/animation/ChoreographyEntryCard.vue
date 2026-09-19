<template>
  <div class="choreography-entry-card" data-testid="choreography-entry-card">
    <!-- Header: block label + type + target part -->
    <div class="choreography-entry-card__header">
      <span class="choreography-entry-card__label">{{ blockLabel || blockType }}</span>
      <span class="choreography-entry-card__part text-muted">&middot; {{ entry.target.part }}</span>
    </div>

    <!-- Preset picker -->
    <MotionPresetPicker
      trigger-type="scroll"
      :target-part="entry.target.part"
      :current-preset-id="entry.presetId"
      @select="onPresetSelect"
    />

    <!-- Scroll range inputs -->
    <div class="choreography-entry-card__range">
      <label class="choreography-entry-card__range-label">Range</label>
      <div class="choreography-entry-card__range-inputs">
        <input
          type="number"
          class="form-control form-control-sm choreography-entry-card__range-input"
          data-testid="range-start"
          min="0"
          max="100"
          step="1"
          :value="rangeStartPct"
          @change="onRangeStartChange(($event.target as HTMLInputElement).value)"
        />
        <span class="choreography-entry-card__range-sep">&mdash;</span>
        <input
          type="number"
          class="form-control form-control-sm choreography-entry-card__range-input"
          data-testid="range-end"
          min="0"
          max="100"
          step="1"
          :value="rangeEndPct"
          @change="onRangeEndChange(($event.target as HTMLInputElement).value)"
        />
      </div>

      <!-- Visual range bar -->
      <div class="choreography-entry-card__bar-track">
        <div
          class="choreography-entry-card__bar-fill"
          :style="barStyle"
        />
      </div>
    </div>

    <!-- Remove button -->
    <button
      type="button"
      class="btn btn-outline-danger btn-sm choreography-entry-card__remove"
      data-testid="entry-remove"
      @click="$emit('remove')"
    >
      Remove
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MotionPresetPicker from '~/admin/components/animation/MotionPresetPicker.vue'
import type { AnimationEntry } from '~/shared/types/animation'

const props = defineProps<{
  entry: AnimationEntry
  blockLabel: string
  blockType: string
}>()

const emit = defineEmits<{
  'update-preset': [presetId: string | undefined]
  'update-range': [range: { start: number; end: number }]
  'remove': []
}>()

const rangeStartPct = computed(() =>
  Math.round((props.entry.scrollRange?.start ?? 0) * 100),
)

const rangeEndPct = computed(() =>
  Math.round((props.entry.scrollRange?.end ?? 1) * 100),
)

const barStyle = computed(() => {
  const start = props.entry.scrollRange?.start ?? 0
  const end = props.entry.scrollRange?.end ?? 1
  return {
    left: `${start * 100}%`,
    width: `${(end - start) * 100}%`,
  }
})

function onPresetSelect(presetId: string | undefined) {
  emit('update-preset', presetId)
}

const MIN_GAP = 0.01

function onRangeStartChange(raw: string) {
  const pct = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(pct)) return
  const clamped = Math.max(0, Math.min(100, pct)) / 100
  const currentEnd = props.entry.scrollRange?.end ?? 1
  const end = clamped >= currentEnd ? Math.min(1, clamped + MIN_GAP) : currentEnd
  emit('update-range', { start: clamped, end })
}

function onRangeEndChange(raw: string) {
  const pct = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(pct)) return
  const clamped = Math.max(0, Math.min(100, pct)) / 100
  const currentStart = props.entry.scrollRange?.start ?? 0
  const start = clamped <= currentStart ? Math.max(0, clamped - MIN_GAP) : currentStart
  emit('update-range', { start, end: clamped })
}
</script>

<style scoped>
.choreography-entry-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--cms-line);
  border-radius: 6px;
  background: var(--cms-canvas);
}

.choreography-entry-card__header {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--cms-ink-body);
}

.choreography-entry-card__part {
  font-size: 12px;
}

.choreography-entry-card__range {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.choreography-entry-card__range-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--cms-ink-body);
}

.choreography-entry-card__range-inputs {
  display: flex;
  align-items: center;
  gap: 6px;
}

.choreography-entry-card__range-input {
  width: 64px;
  text-align: center;
  font-size: 12px;
}

.choreography-entry-card__range-sep {
  color: var(--cms-ink-subtle);
  font-size: 12px;
}

.choreography-entry-card__bar-track {
  position: relative;
  height: 6px;
  background: var(--cms-line);
  border-radius: 3px;
  overflow: hidden;
}

.choreography-entry-card__bar-fill {
  position: absolute;
  top: 0;
  height: 100%;
  background: var(--cms-accent);
  border-radius: 3px;
  min-width: 2px;
}

.choreography-entry-card__remove {
  align-self: flex-end;
  font-size: 12px;
  padding: 2px 10px;
}
</style>
