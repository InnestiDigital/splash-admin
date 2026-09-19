<!-- admin/components/editor/FramePanel.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import TTokenSelector from '~/admin/components/fields/TTokenSelector.vue'
import type { BlockPlacementConfig, WrapperOverrides } from '~/shared/types/placement'
import {
  WRAPPER_STYLE_OPTIONS, SHADOW_TOKENS, BORDER_RADIUS_TOKENS,
} from '~/shared/types/placement'
import type { BorderRadiusToken } from '~/shared/types/placement'

const props = defineProps<{
  placement: BlockPlacementConfig
}>()

const emit = defineEmits<{
  'update:placement': [value: BlockPlacementConfig]
}>()

function update(partial: Partial<BlockPlacementConfig>) {
  emit('update:placement', { ...props.placement, ...partial })
}

function updateOverride(key: keyof WrapperOverrides, value: any) {
  update({
    wrapperOverrides: {
      ...props.placement.wrapperOverrides,
      [key]: value,
    },
  })
}

function clearOverride(key: keyof WrapperOverrides) {
  const next = { ...props.placement.wrapperOverrides }
  delete next[key]
  const hasAny = Object.values(next).some(v => v != null)
  update({ wrapperOverrides: hasAny ? next : undefined })
}

// --- BorderRadius conversion helpers ---
function borderRadiusToSelectorValue(br: BorderRadiusToken | undefined) {
  if (!br) return undefined
  if (typeof br === 'string') return { mode: 'token' as const, value: br }
  return { mode: 'custom' as const, value: br.custom, unit: br.unit }
}

function selectorValueToBorderRadius(sv: any): BorderRadiusToken | undefined {
  if (!sv) return undefined
  if (sv.mode === 'token') return sv.value
  return { custom: sv.value, unit: sv.unit }
}

const showAdvanced = ref(false)
const hasFrame = computed(() =>
  props.placement.wrapperStyle && props.placement.wrapperStyle !== 'none'
)

const styleLabels: Record<string, string> = {
  none: 'None',
  card: 'Card',
  elevated: 'Elevated',
  inset: 'Inset',
}

const semanticColorOptions = [
  { value: 'section', label: 'Match Section' },
  { value: 'transparent', label: 'None' },
  { value: 'surface', label: 'Surface' },
  { value: 'accent', label: 'Accent' },
] as const
</script>

<template>
  <div class="frame-panel">
    <div class="frame-panel__field">
      <label class="frame-panel__label">Style</label>
      <div class="frame-panel__presets">
        <button
          v-for="style in WRAPPER_STYLE_OPTIONS"
          :key="style"
          class="frame-panel__preset"
          :class="{ 'frame-panel__preset--active': placement.wrapperStyle === style }"
          @click="update({ wrapperStyle: style })"
        >
          {{ styleLabels[style] }}
        </button>
      </div>
    </div>

    <div v-if="hasFrame" class="frame-panel__advanced-toggle">
      <button
        class="frame-panel__toggle-btn"
        @click="showAdvanced = !showAdvanced"
      >
        {{ showAdvanced ? '▼' : '▶' }} Customize frame
      </button>
    </div>

    <div v-if="hasFrame && showAdvanced" class="frame-panel__overrides">
      <TTokenSelector
        label="Border Radius"
        :model-value="borderRadiusToSelectorValue(placement.wrapperOverrides?.borderRadius)"
        :tokens="BORDER_RADIUS_TOKENS"
        allow-custom
        :custom-max="100"
        custom-unit="px"
        @update:model-value="updateOverride('borderRadius', selectorValueToBorderRadius($event))"
      />
      <button
        v-if="placement.wrapperOverrides?.borderRadius"
        class="frame-panel__clear"
        @click="clearOverride('borderRadius')"
      >Reset to preset</button>

      <TTokenSelector
        label="Shadow"
        :model-value="placement.wrapperOverrides?.shadow
          ? { mode: 'token', value: placement.wrapperOverrides.shadow }
          : undefined"
        :tokens="SHADOW_TOKENS"
        @update:model-value="updateOverride('shadow', $event?.value)"
      />
      <button
        v-if="placement.wrapperOverrides?.shadow"
        class="frame-panel__clear"
        @click="clearOverride('shadow')"
      >Reset to preset</button>

      <div class="frame-panel__field">
        <label class="frame-panel__label">Background</label>
        <div class="frame-panel__options">
          <button
            v-for="opt in semanticColorOptions"
            :key="opt.value"
            class="frame-panel__opt"
            :class="{ 'frame-panel__opt--active':
              typeof placement.wrapperOverrides?.backgroundColor === 'string'
              && placement.wrapperOverrides.backgroundColor === opt.value
            }"
            @click="updateOverride('backgroundColor', opt.value)"
          >
            {{ opt.label }}
          </button>
          <button
            v-if="placement.wrapperOverrides?.backgroundColor"
            class="frame-panel__clear"
            @click="clearOverride('backgroundColor')"
          >×</button>
        </div>
      </div>

      <div class="frame-panel__field">
        <label class="frame-panel__label">Border Color</label>
        <div class="frame-panel__options">
          <button
            v-for="opt in semanticColorOptions"
            :key="opt.value"
            class="frame-panel__opt"
            :class="{ 'frame-panel__opt--active':
              typeof placement.wrapperOverrides?.borderColor === 'string'
              && placement.wrapperOverrides.borderColor === opt.value
            }"
            @click="updateOverride('borderColor', opt.value)"
          >
            {{ opt.label }}
          </button>
          <button
            v-if="placement.wrapperOverrides?.borderColor"
            class="frame-panel__clear"
            @click="clearOverride('borderColor')"
          >×</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.frame-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.frame-panel__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.frame-panel__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--cms-ink-body);
}
.frame-panel__presets {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.frame-panel__preset {
  padding: 5px 12px;
  font-size: 11px;
  font-weight: 500;
  background: var(--cms-surface-subtle);
  border: 1px solid var(--cms-line-strong);
  border-radius: 4px;
  color: var(--cms-ink-body);
  cursor: pointer;
  transition: background-color var(--cms-motion-fast) var(--cms-ease-out), border-color var(--cms-motion-fast) var(--cms-ease-out), color var(--cms-motion-fast) var(--cms-ease-out);
}
.frame-panel__preset:hover {
  background: var(--cms-surface-sunken);
  color: var(--cms-ink-body);
}
.frame-panel__preset--active {
  background: var(--cms-accent-soft);
  border-color: var(--cms-accent);
  color: var(--cms-accent);
}
.frame-panel__advanced-toggle {
  margin-top: -8px;
}
.frame-panel__toggle-btn {
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 500;
  background: none;
  border: 1px solid var(--cms-line-strong);
  border-radius: 4px;
  color: var(--cms-ink-body);
  cursor: pointer;
  transition: background-color var(--cms-motion-fast) var(--cms-ease-out), border-color var(--cms-motion-fast) var(--cms-ease-out), color var(--cms-motion-fast) var(--cms-ease-out);
}
.frame-panel__toggle-btn:hover {
  background: var(--cms-surface-subtle);
  color: var(--cms-ink-body);
}
.frame-panel__overrides {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px;
  background: var(--cms-canvas);
  border: 1px solid var(--cms-line);
  border-radius: 6px;
}
.frame-panel__options {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: center;
}
.frame-panel__opt {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  background: var(--cms-surface-subtle);
  border: 1px solid var(--cms-line-strong);
  border-radius: 4px;
  color: var(--cms-ink-body);
  cursor: pointer;
  transition: background-color var(--cms-motion-fast) var(--cms-ease-out), border-color var(--cms-motion-fast) var(--cms-ease-out), color var(--cms-motion-fast) var(--cms-ease-out);
}
.frame-panel__opt:hover {
  background: var(--cms-surface-sunken);
  color: var(--cms-ink-body);
}
.frame-panel__opt--active {
  background: var(--cms-accent-soft);
  border-color: var(--cms-accent);
  color: var(--cms-accent);
}
.frame-panel__clear {
  padding: 2px 8px;
  font-size: 11px;
  background: none;
  border: 1px solid var(--cms-line-strong);
  border-radius: 4px;
  color: var(--cms-ink-subtle);
  cursor: pointer;
  transition: background-color var(--cms-motion-fast) var(--cms-ease-out), border-color var(--cms-motion-fast) var(--cms-ease-out), color var(--cms-motion-fast) var(--cms-ease-out);
}
.frame-panel__clear:hover {
  background: var(--cms-danger-soft);
  border-color: var(--cms-danger);
  color: var(--cms-danger);
}
</style>
