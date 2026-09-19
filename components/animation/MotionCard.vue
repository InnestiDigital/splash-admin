<template>
  <div
    class="motion-card"
    role="button"
    tabindex="0"
    data-testid="motion-card"
    @click="$emit('click')"
    @keydown.enter="$emit('click')"
  >
    <!-- ═══ Choreography card ═══ -->
    <template v-if="isChoreography">
      <div class="motion-card__line1">
        <span class="motion-card__icon">&#x1F3BC;</span>
        <span class="motion-card__name">{{ choreographyName }}</span>
      </div>
      <div class="motion-card__line2">
        <span class="motion-card__target text-muted">{{ scene.entries.length }} blocks</span>
        <span class="motion-card__trigger text-muted">&middot; Scroll</span>
        <span class="motion-card__chip" :class="chipClasses">{{ chip }}</span>
      </div>
    </template>

    <!-- ═══ Standard motion card ═══ -->
    <template v-else>
      <div class="motion-card__line1">
        <span class="motion-card__icon">{{ typeIcon }}</span>
        <span class="motion-card__name">{{ presetLabel }}</span>
      </div>
      <div class="motion-card__line2">
        <span class="motion-card__target text-muted">{{ targetPart }}</span>
        <span class="motion-card__trigger text-muted">&middot; {{ triggerLabel }}</span>
        <span class="motion-card__chip" :class="chipClasses">{{ chip }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AnimationScene } from '~/shared/types/animation'
import type { ValidationIssue } from '~/shared/features/cms/animation/sceneValidation'
import { getTriggerType, getStatusChip } from '~/admin/composables/useMotionDetailState'

const props = defineProps<{
  scene: AnimationScene
  validationIssues: ValidationIssue[]
}>()

defineEmits<{
  click: []
}>()

const TRIGGER_ICONS: Record<string, string> = {
  entrance: '\uD83C\uDFAC',
  scroll: '\uD83D\uDCDC',
  hover: '\uD83D\uDC46',
  loop: '\uD83D\uDD04',
}

const TRIGGER_LABELS: Record<string, string> = {
  entrance: 'Entrance',
  scroll: 'Scroll',
  hover: 'Hover',
  loop: 'Loop',
}

const CHIP_CLASSES: Record<string, string> = {
  valid: 'badge bg-success-subtle text-success',
  conflict: 'badge bg-warning-subtle text-warning',
  disabled: 'badge bg-secondary-subtle text-secondary',
  custom: 'badge bg-info-subtle text-info',
}

const isChoreography = computed(() => !!props.scene.sectionId)

const choreographyName = computed(() =>
  props.scene.choreographyMeta?.name || 'Untitled Choreography',
)

const triggerType = computed(() => getTriggerType(props.scene))

const typeIcon = computed(() => TRIGGER_ICONS[triggerType.value] ?? '')

const presetLabel = computed(() => {
  const entry = props.scene.entries[0]
  return entry?.presetId ?? 'Custom'
})

const targetPart = computed(() => {
  const entry = props.scene.entries[0]
  return entry?.target.part ?? 'root'
})

const triggerLabel = computed(() => TRIGGER_LABELS[triggerType.value] ?? triggerType.value)

const chip = computed(() => getStatusChip(props.scene, props.validationIssues))

const chipClasses = computed(() => CHIP_CLASSES[chip.value] ?? '')
</script>

<style scoped>
.motion-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border: 1px solid var(--cms-line);
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.motion-card:hover {
  background-color: var(--cms-surface-subtle);
}

.motion-card:focus-visible {
  outline: 2px solid var(--cms-accent);
  outline-offset: 1px;
}

.motion-card__line1 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--cms-ink-body);
}

.motion-card__icon {
  flex-shrink: 0;
}

.motion-card__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.motion-card__line2 {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.motion-card__target,
.motion-card__trigger {
  white-space: nowrap;
}

.motion-card__chip {
  margin-left: auto;
  font-size: 11px;
}
</style>
