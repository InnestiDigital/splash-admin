<template>
  <span
    v-if="scenes.length > 0"
    class="motion-budget-pill"
    :class="pillClass"
    :title="tooltipText"
    data-testid="motion-budget-pill"
  >
    Motion: {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AnimationScene } from '~/shared/types/animation'
import { calculatePageBudget, DEFAULT_BUDGET_DESKTOP } from '~/shared/features/cms/animation/motionBudget'

const props = defineProps<{
  scenes: AnimationScene[]
}>()

const budget = computed(() => calculatePageBudget(props.scenes, DEFAULT_BUDGET_DESKTOP))

const percentage = computed(() => (budget.value.totalCost / DEFAULT_BUDGET_DESKTOP) * 100)

const label = computed(() => {
  if (percentage.value > 80) return 'Heavy'
  if (percentage.value > 60) return 'Moderate'
  return 'Healthy'
})

const pillClass = computed(() => {
  if (percentage.value > 80) return 'motion-budget-pill--heavy'
  if (percentage.value > 60) return 'motion-budget-pill--moderate'
  return 'motion-budget-pill--healthy'
})

const tooltipText = computed(() => {
  return `${budget.value.totalCost} / ${DEFAULT_BUDGET_DESKTOP} (${budget.value.sceneCosts.length} scenes)`
})
</script>

<style scoped>
.motion-budget-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  cursor: default;
  margin-left: auto;
  margin-right: 12px;
}

.motion-budget-pill--healthy {
  background: #dcfce7;
  color: #166534;
}

.motion-budget-pill--moderate {
  background: #fef9c3;
  color: #854d0e;
}

.motion-budget-pill--heavy {
  background: #fecaca;
  color: #991b1b;
}
</style>
