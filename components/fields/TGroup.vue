<template>
  <div class="t-group" :class="{ 't-group--collapsed': collapsed }">
    <button
      v-if="collapsible && !forceOpen"
      class="t-group__header"
      type="button"
      :aria-expanded="!collapsed"
      :aria-controls="contentId"
      @click="toggle"
    >
      <span class="t-group__label">{{ label }}</span>
      <span class="material-icons-outlined t-group__toggle" aria-hidden="true">expand_more</span>
    </button>
    <div v-else class="t-group__header t-group__header--static">
      <span class="t-group__label">{{ label }}</span>
    </div>
    <div v-show="!collapsed" :id="contentId" class="t-group__content">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, useId, watch } from 'vue'

const props = withDefaults(defineProps<{
  label: string
  collapsible?: boolean
  defaultOpen?: boolean
  forceOpen?: boolean
}>(), {
  collapsible: false,
  defaultOpen: true,
  forceOpen: false,
})

const contentId = `t-group-${useId()}`
const collapsed = ref(props.collapsible && !props.defaultOpen)

function toggle(): void {
  if (props.forceOpen) return
  collapsed.value = !collapsed.value
}

watch(() => props.forceOpen, (forceOpen) => {
  if (forceOpen) collapsed.value = false
})
</script>

<style scoped>
.t-group {
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface);
  overflow: hidden;
  box-shadow: var(--cms-elev-1, 0 1px 2px rgba(33, 30, 25, 0.05));
}

.t-group__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-height: 46px;
  padding: 0 var(--cms-sp-4, 16px);
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  border: none;
  border-bottom: 1px solid var(--cms-line, var(--cms-line));
  color: var(--cms-ink, var(--cms-ink));
  cursor: pointer;
  text-align: left;
  transition:
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.t-group__header--static {
  cursor: default;
}

.t-group--collapsed .t-group__header {
  border-bottom-color: transparent;
}

.t-group__label {
  font-size: var(--cms-fs-sm, 13px);
  font-weight: 600;
  letter-spacing: -0.005em;
}

.t-group__toggle {
  font-size: 18px;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  transform: rotate(180deg);
  transition: transform var(--cms-motion-normal, 180ms) var(--cms-ease-out, ease-out);
}

.t-group--collapsed .t-group__toggle {
  transform: rotate(0deg);
}

@media (hover: hover) and (pointer: fine) {
  .t-group__header:not(.t-group__header--static):hover {
    background: var(--cms-surface-sunken, var(--cms-surface-sunken));
  }
}

.t-group__content {
  background: var(--cms-surface);
  padding: var(--cms-sp-4, 16px);
  display: flex;
  flex-direction: column;
  gap: 18px;
}
</style>
