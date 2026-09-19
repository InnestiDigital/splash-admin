<script setup lang="ts">
import { computed } from 'vue'
import type { AnimationScene } from '~/shared/types/animation'
import { calculatePageBudget, DEFAULT_BUDGET_DESKTOP } from '~/shared/features/cms/animation/motionBudget'

const props = defineProps<{
  scenes: AnimationScene[]
  budgetLimit?: number
}>()

const limit = computed(() => props.budgetLimit ?? DEFAULT_BUDGET_DESKTOP)

const budget = computed(() => calculatePageBudget(props.scenes, limit.value))

const percentage = computed(() =>
  Math.min(Math.round((budget.value.totalCost / limit.value) * 100), 100),
)

const barState = computed<'green' | 'yellow' | 'red'>(() => {
  const pct = (budget.value.totalCost / limit.value) * 100
  if (pct > 80) return 'red'
  if (pct > 60) return 'yellow'
  return 'green'
})

const barClass = computed(() => {
  const stateMap = { green: 'bg-success', yellow: 'bg-warning', red: 'bg-danger' }
  return stateMap[barState.value]
})

const tooltipText = computed(() => {
  return budget.value.sceneCosts
    .map((sc) => {
      const effects = Object.entries(sc.breakdown)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
      return `${sc.sceneId}: ${sc.cost} (${effects})`
    })
    .join('\n')
})
</script>

<template>
  <div class="motion-budget-indicator" data-testid="motion-budget-indicator">
    <div class="d-flex justify-content-between align-items-center mb-1">
      <small class="text-muted">Motion Budget</small>
      <small data-testid="budget-label">{{ budget.totalCost }} / {{ limit }}</small>
    </div>
    <div
      class="progress"
      style="height: 8px"
      :title="tooltipText"
      data-testid="budget-bar"
    >
      <div
        class="progress-bar"
        :class="barClass"
        role="progressbar"
        :style="{ width: percentage + '%' }"
        :aria-valuenow="budget.totalCost"
        :aria-valuemin="0"
        :aria-valuemax="limit"
        :data-state="barState"
      />
    </div>
    <div
      v-if="budget.sceneCosts.length > 0"
      class="mt-1"
      data-testid="budget-breakdown"
    >
      <small
        v-for="sc in budget.sceneCosts"
        :key="sc.sceneId"
        class="d-block text-muted"
        :data-testid="'cost-' + sc.sceneId"
      >
        {{ sc.sceneId }}: {{ sc.cost }}
      </small>
    </div>
  </div>
</template>
