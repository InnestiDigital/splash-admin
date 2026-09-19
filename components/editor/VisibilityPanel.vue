<!-- admin/components/editor/VisibilityPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import type { BlockPlacementConfig, ViewportName, VisibleTo } from '~/shared/types/placement'
import { VIEWPORT_OPTIONS, VISIBLE_TO_OPTIONS } from '~/shared/types/placement'

const props = defineProps<{
  placement: BlockPlacementConfig
}>()

const emit = defineEmits<{
  'update:placement': [value: BlockPlacementConfig]
}>()

const hidden = computed<ViewportName[]>(() => props.placement.hiddenViewports ?? [])

function isVisible(vp: ViewportName): boolean {
  return !hidden.value.includes(vp)
}

function toggle(vp: ViewportName) {
  const next = isVisible(vp)
    ? [...hidden.value, vp]
    : hidden.value.filter(v => v !== vp)
  // Normalize: drop the key entirely when nothing is hidden so a fully-visible
  // block round-trips as `undefined` (matches the "absent = visible" contract).
  const placement = { ...props.placement }
  if (next.length) placement.hiddenViewports = next
  else delete placement.hiddenViewports
  emit('update:placement', placement)
}

const meta: Record<ViewportName, { label: string; icon: string }> = {
  // Material Symbols glyph names — rendered via the existing icon font.
  desktop: { label: 'Desktop', icon: 'computer' },
  tablet: { label: 'Tablet', icon: 'tablet_mac' },
  mobile: { label: 'Mobile', icon: 'smartphone' },
}

const allHidden = computed(() => hidden.value.length >= VIEWPORT_OPTIONS.length)

const visibleTo = computed<VisibleTo>(() => props.placement.visibleTo ?? 'everyone')

const visibleToLabel: Record<VisibleTo, string> = {
  everyone: 'Everyone',
  auth: 'Signed-in visitors',
  guest: 'Signed-out visitors',
}

function setVisibleTo(next: VisibleTo) {
  const placement = { ...props.placement }
  // Normalize: 'everyone' is the absent state, matching hiddenViewports: [].
  if (next === 'everyone') delete placement.visibleTo
  else placement.visibleTo = next
  emit('update:placement', placement)
}
</script>

<template>
  <div class="visibility-panel">
    <div class="visibility-panel__group">
      <p class="visibility-panel__grouplabel">Who sees this</p>
      <div class="visibility-panel__radios" role="radiogroup" aria-label="Who sees this block">
        <button
          v-for="opt in VISIBLE_TO_OPTIONS"
          :key="opt"
          type="button"
          role="radio"
          class="visibility-panel__radio"
          :class="{ 'visibility-panel__radio--on': visibleTo === opt }"
          :aria-checked="visibleTo === opt"
          @click="setVisibleTo(opt)"
        >{{ visibleToLabel[opt] }}</button>
      </div>
      <p v-if="visibleTo !== 'everyone'" class="visibility-panel__warn">
        {{ visibleTo === 'auth' ? 'Signed-out visitors' : 'Signed-in visitors' }}
        won't see this block, but its content is still in the page source.
        Don't use this for confidential content — use the page's
        <strong>Requires sign-in</strong> setting for that.
      </p>
    </div>
    <p class="visibility-panel__hint">
      Toggle which breakpoints this block appears at. Hidden breakpoints are skipped
      at render — switch the preview device to see the effect.
    </p>
    <div class="visibility-panel__options">
      <button
        v-for="vp in VIEWPORT_OPTIONS"
        :key="vp"
        type="button"
        class="visibility-panel__opt"
        :class="{ 'visibility-panel__opt--hidden': !isVisible(vp) }"
        :aria-pressed="isVisible(vp)"
        :title="isVisible(vp) ? `Visible on ${meta[vp].label} — click to hide` : `Hidden on ${meta[vp].label} — click to show`"
        @click="toggle(vp)"
      >
        <span class="material-icons-outlined visibility-panel__device">{{ meta[vp].icon }}</span>
        <span class="visibility-panel__label">{{ meta[vp].label }}</span>
        <span class="material-icons-outlined visibility-panel__eye">
          {{ isVisible(vp) ? 'visibility' : 'visibility_off' }}
        </span>
      </button>
    </div>
    <p v-if="allHidden" class="visibility-panel__warn">
      This block is hidden on every breakpoint — it won't render on the live site.
    </p>
  </div>
</template>

<style scoped>
.visibility-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.visibility-panel__hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--cms-ink-subtle);
}
.visibility-panel__group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.visibility-panel__grouplabel {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: #444;
}
.visibility-panel__radios {
  display: flex;
  gap: 6px;
}
.visibility-panel__radio {
  flex: 1;
  padding: 7px 6px;
  font-size: 11px;
  font-weight: 600;
  background: var(--cms-surface-subtle);
  border: 1px solid var(--cms-line-strong);
  border-radius: 6px;
  color: var(--cms-ink-muted);
  cursor: pointer;
}
.visibility-panel__radio--on {
  background: var(--cms-accent-soft);
  border-color: var(--cms-accent);
  color: var(--cms-accent);
}
.visibility-panel__options {
  display: flex;
  gap: 6px;
}
.visibility-panel__opt {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  background: var(--cms-accent-soft);
  border: 1px solid var(--cms-accent);
  border-radius: 6px;
  color: var(--cms-accent);
  cursor: pointer;
  transition: background-color var(--cms-motion-fast) var(--cms-ease-out), border-color var(--cms-motion-fast) var(--cms-ease-out), color var(--cms-motion-fast) var(--cms-ease-out);
}
.visibility-panel__opt:hover {
  filter: brightness(0.97);
}
.visibility-panel__opt--hidden {
  background: var(--cms-surface-subtle);
  border-color: var(--cms-line-strong);
  color: #9aa0a6;
}
.visibility-panel__device {
  font-size: 20px;
}
.visibility-panel__label {
  font-size: 11px;
  font-weight: 600;
}
.visibility-panel__eye {
  font-size: 14px;
}
.visibility-panel__warn {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: #b26a00;
}
</style>
