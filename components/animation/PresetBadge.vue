<template>
  <span
    class="preset-badge"
    :class="badgeClass"
    data-testid="preset-badge"
  >
    {{ detachment.label }}
    <button
      v-if="detachment.isDetached"
      type="button"
      class="preset-badge__revert"
      data-testid="revert-button"
      title="Revert to preset defaults"
      @click="$emit('revert')"
    >
      Revert
    </button>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DetachmentInfo } from '~/shared/features/cms/animation/presetDetachment'

const props = defineProps<{
  detachment: DetachmentInfo
}>()

defineEmits<{
  revert: []
}>()

const badgeClass = computed(() => {
  if (props.detachment.presetId == null) return 'preset-badge--custom'
  if (props.detachment.isDetached) return 'preset-badge--detached'
  return 'preset-badge--preset'
})
</script>

<style scoped>
.preset-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
}

.preset-badge--preset {
  background-color: #dbeafe;
  color: #1e40af;
}

.preset-badge--detached {
  background-color: var(--cms-warn-soft);
  color: var(--cms-warn);
}

.preset-badge--custom {
  background-color: #f3f4f6;
  color: #6b7280;
}

.preset-badge__revert {
  all: unset;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  text-decoration: underline;
  color: inherit;
}

.preset-badge__revert:hover {
  opacity: 0.8;
}
</style>
