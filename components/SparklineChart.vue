<template>
  <svg
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    class="sparkline-chart"
  >
    <polyline
      :points="polylinePoints"
      fill="none"
      :stroke="color"
      stroke-width="1.5"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    <circle
      v-if="normalizedData.length > 0"
      :cx="lastPoint.x"
      :cy="lastPoint.y"
      r="2.5"
      :fill="color"
    />
  </svg>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  data: number[]
  width?: number
  height?: number
  color?: string
}>(), {
  width: 80,
  height: 28,
  color: '#2e7d32',
})

const padding = 3

const normalizedData = computed(() => {
  if (!props.data || props.data.length === 0) return []
  return props.data
})

const points = computed(() => {
  const d = normalizedData.value
  if (d.length === 0) return []

  const min = Math.min(...d)
  const max = Math.max(...d)
  const range = max - min || 1

  const usableWidth = props.width - padding * 2
  const usableHeight = props.height - padding * 2
  const stepX = d.length > 1 ? usableWidth / (d.length - 1) : 0

  return d.map((val, i) => ({
    x: padding + i * stepX,
    y: padding + usableHeight - ((val - min) / range) * usableHeight,
  }))
})

const polylinePoints = computed(() =>
  points.value.map(p => `${p.x},${p.y}`).join(' '),
)

const lastPoint = computed(() => {
  const pts = points.value
  return pts.length > 0 ? pts[pts.length - 1] : { x: 0, y: 0 }
})
</script>

<style scoped>
.sparkline-chart {
  display: block;
  flex-shrink: 0;
}
</style>
