<!-- admin/components/editor/PlacementPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import TTokenSelector from '~/admin/components/fields/TTokenSelector.vue'
import type {
  BlockPlacementConfig,
  CanvasBlockGeometry,
  SpacingValue,
  MaxWidthValue,
} from '~/shared/types/placement'
import { crossScopeWidthHint } from '~/shared/features/layout/widthHints'
import {
  ALIGN_SELF_OPTIONS,
  CANVAS_POSITION_BOUNDS,
  CANVAS_SIZE_BOUNDS,
  MAX_WIDTH_TOKENS,
  SPACING_TOKENS,
  WIDTH_MODE_OPTIONS,
} from '~/shared/types/placement'

const props = defineProps<{
  placement: BlockPlacementConfig
  canvasMode?: boolean
  sectionContainerMode?: string | null
  disabled?: Partial<Record<keyof BlockPlacementConfig, boolean>>
}>()

const emit = defineEmits<{
  'update:placement': [value: BlockPlacementConfig]
}>()

function update(partial: Partial<BlockPlacementConfig>) {
  emit('update:placement', { ...props.placement, ...partial })
}

type CanvasNumberKey = Exclude<keyof CanvasBlockGeometry, 'locked' | 'zIndex'>

const canvasFields: Array<{
  key: CanvasNumberKey
  label: string
  min: number
  max: number
  step: number
  suffix?: string
  placeholder: string
}> = [
  { key: 'x', label: 'X', min: CANVAS_POSITION_BOUNDS.min, max: CANVAS_POSITION_BOUNDS.max, step: 0.1, suffix: '%', placeholder: 'Auto' },
  { key: 'y', label: 'Y', min: CANVAS_POSITION_BOUNDS.min, max: CANVAS_POSITION_BOUNDS.max, step: 0.1, suffix: '%', placeholder: 'Auto' },
  { key: 'width', label: 'Width', min: CANVAS_SIZE_BOUNDS.min, max: CANVAS_SIZE_BOUNDS.max, step: 0.1, suffix: '%', placeholder: 'Auto' },
  { key: 'height', label: 'Height', min: CANVAS_SIZE_BOUNDS.min, max: CANVAS_SIZE_BOUNDS.max, step: 0.1, suffix: '%', placeholder: 'Auto' },
  { key: 'rotation', label: 'Rotation', min: -360, max: 360, step: 0.5, suffix: '°', placeholder: '0' },
]

function updateCanvasNumber(key: CanvasNumberKey, event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const next = { ...(props.placement.canvas ?? {}) }
  if (input.value.trim() === '') {
    delete next[key]
  } else {
    const field = canvasFields.find(candidate => candidate.key === key)
    const parsed = Number(input.value)
    if (!field || !Number.isFinite(parsed)) return
    const bounded = Math.min(field.max, Math.max(field.min, parsed))
    next[key] = bounded
  }
  update({ canvas: next })
}

function updateCanvasLocked(event: Event) {
  const checked = (event.currentTarget as HTMLInputElement).checked
  update({ canvas: { ...(props.placement.canvas ?? {}), locked: checked } })
}

// Derive from actual placement state — stays in sync if placement changes externally.
const showMaxWidth = computed(() => !!props.placement.maxWidth)

const widthHint = computed(() =>
  crossScopeWidthHint(props.sectionContainerMode, props.placement.widthMode, props.placement.maxWidth),
)

const widthHintText = computed(() => {
  switch (widthHint.value) {
    case 'constrained-in-full-bleed':
      return 'This section is Full Width — this block’s own width setting decides how far its content stretches inside it.'
    case 'full-in-narrow':
      return 'This section is Narrow — Full Width fills the section’s 720px container, not the browser window.'
    case 'none':
      return ''
    default: {
      const exhaustive: never = widthHint.value
      return exhaustive
    }
  }
})

const widthModeLabels: Record<string, string> = {
  auto: 'Auto',
  content: 'Fit to Content',
  full: 'Full Width',
}

const alignLabels: Record<string, string> = {
  start: '\u2190 Start',
  center: '\u2194 Center',
  end: '\u2192 End',
  stretch: '\u2921 Stretch',
}
</script>

<template>
  <div class="placement-panel">
    <template v-if="canvasMode">
      <p class="placement-panel__canvas-hint">
        Drag, resize, or rotate the selected layer on the canvas. Use these controls for precise values.
      </p>
      <div class="placement-panel__canvas-grid">
        <label
          v-for="field in canvasFields"
          :key="field.key"
          class="placement-panel__canvas-field"
        >
          <span>{{ field.label }}</span>
          <span class="placement-panel__number-wrap">
            <input
              type="number"
              :value="placement.canvas?.[field.key] ?? ''"
              :min="field.min"
              :max="field.max"
              :step="field.step"
              :placeholder="field.placeholder"
              @change="updateCanvasNumber(field.key, $event)"
            />
            <span v-if="field.suffix" aria-hidden="true">{{ field.suffix }}</span>
          </span>
        </label>
      </div>
      <label class="placement-panel__toggle-label placement-panel__lock">
        <input
          type="checkbox"
          :checked="placement.canvas?.locked === true"
          @change="updateCanvasLocked"
        />
        Lock this layer
      </label>
    </template>

    <template v-else>
      <TTokenSelector
        label="Top Spacing"
        :model-value="placement.marginTop"
        :tokens="SPACING_TOKENS"
        allow-custom
        :custom-max="200"
        custom-unit="px"
        @update:model-value="update({ marginTop: $event as SpacingValue })"
      />

      <TTokenSelector
        label="Bottom Spacing"
        :model-value="placement.marginBottom"
        :tokens="SPACING_TOKENS"
        allow-custom
        :custom-max="200"
        custom-unit="px"
        @update:model-value="update({ marginBottom: $event as SpacingValue })"
      />

      <div class="placement-panel__field">
        <label class="placement-panel__label">Position in Section</label>
        <div class="placement-panel__options">
          <button
            v-for="opt in ALIGN_SELF_OPTIONS"
            :key="opt"
            type="button"
            class="placement-panel__opt"
            :class="{
              'placement-panel__opt--active': placement.alignSelf === opt,
              'placement-panel__opt--disabled': disabled?.alignSelf,
            }"
            :disabled="disabled?.alignSelf"
            @click="update({ alignSelf: opt })"
          >
            {{ alignLabels[opt] }}
          </button>
        </div>
        <p v-if="disabled?.alignSelf" class="placement-panel__hint">
          Alignment is unavailable while Width is Full Width — choose Auto or Fit to Content to move this block.
        </p>
      </div>

      <div class="placement-panel__field">
        <label class="placement-panel__label">Width</label>
        <div class="placement-panel__options">
          <button
            v-for="opt in WIDTH_MODE_OPTIONS"
            :key="opt"
            type="button"
            class="placement-panel__opt"
            :class="{ 'placement-panel__opt--active': placement.widthMode === opt }"
            @click="update({ widthMode: opt })"
          >
            {{ widthModeLabels[opt] }}
          </button>
        </div>
        <p v-if="widthHintText" class="placement-panel__hint" data-width-hint>
          {{ widthHintText }}
        </p>
      </div>

      <div class="placement-panel__field">
        <label class="placement-panel__toggle-label">
          <input
            type="checkbox"
            :checked="showMaxWidth"
            @change="showMaxWidth
              ? update({ maxWidth: undefined })
              : update({ maxWidth: { mode: 'token', value: 'lg' } })"
          />
          Constrain width
        </label>
        <TTokenSelector
          v-if="showMaxWidth"
          :model-value="placement.maxWidth"
          :tokens="MAX_WIDTH_TOKENS"
          allow-custom
          :custom-max="2000"
          custom-unit="px"
          @update:model-value="update({ maxWidth: $event as MaxWidthValue })"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.placement-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.placement-panel__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.placement-panel__canvas-hint,
.placement-panel__hint {
  margin: 0;
  color: var(--cms-ink-muted);
  font-size: 12px;
  line-height: 1.45;
}
.placement-panel__canvas-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.placement-panel__canvas-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--cms-ink-muted);
  font-size: 11px;
  font-weight: 600;
}
.placement-panel__number-wrap {
  display: flex;
  align-items: center;
  min-width: 0;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  background: var(--cms-surface);
  color: var(--cms-ink-muted);
}
.placement-panel__number-wrap:focus-within {
  border-color: var(--cms-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--cms-accent) 18%, transparent);
}
.placement-panel__number-wrap input {
  width: 100%;
  min-width: 0;
  padding: 7px 4px 7px 8px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--cms-ink);
  font: inherit;
  font-variant-numeric: tabular-nums;
}
.placement-panel__number-wrap > span {
  padding-inline-end: 7px;
  font-weight: 500;
}
.placement-panel__lock {
  padding-top: 2px;
}
.placement-panel__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--cms-ink-body);
}
.placement-panel__toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--cms-ink-body);
  cursor: pointer;
}
.placement-panel__toggle-label input[type="checkbox"] {
  accent-color: var(--cms-accent);
}
.placement-panel__options {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.placement-panel__opt {
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 500;
  background: var(--cms-surface-subtle);
  border: 1px solid var(--cms-line-strong);
  border-radius: 4px;
  color: var(--cms-ink-body);
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease, transform 120ms ease-out;
}
.placement-panel__opt:active {
  transform: scale(0.97);
}
@media (hover: hover) and (pointer: fine) {
  .placement-panel__opt:hover {
    background: var(--cms-surface-sunken);
    color: var(--cms-ink-body);
  }
}
.placement-panel__opt--active {
  background: var(--cms-accent-soft);
  border-color: var(--cms-accent);
  color: var(--cms-accent);
}
.placement-panel__opt--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
