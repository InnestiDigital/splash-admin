<template>
  <div class="focal-point-picker" ref="containerRef" @click="onPickPoint">
    <img :src="src" class="focal-point-picker__image" />
    <div
      class="focal-point-picker__marker"
      :style="{ left: `${modelValue.x * 100}%`, top: `${modelValue.y * 100}%` }"
    />
  </div>
</template>

<script setup lang="ts">
// The NUMERIC tier of the two-tier focal-point model. Focal point is authored
// two ways on purpose, and they are not competing spellings of one control:
//
//   - ENUM tier — the nine named tokens owned by the `media-art-direction`
//     settings fragment, for a block rendering ONE piece of media into a frame
//     the author does not otherwise position. A select is the right control
//     there: the choice is coarse and the frame is fixed.
//   - NUMERIC tier — THIS picker (normalized 0-1) and ScatterCollage's per-item
//     `focalX`/`focalY` (0-100), for per-item collage geometry where the author
//     is already placing the item by hand and nine positions would be a
//     downgrade.
//
// `resolveFocalPoint()` in `shared/features/cms/media/artDirection.ts` bridges
// them: an enum token resolves to the same {x,y} percentages this picker
// stores, so both tiers converge on one `object-position` expression.
import { ref } from 'vue'

const props = defineProps<{
  src: string
  modelValue: { x: number; y: number }
}>()

const emit = defineEmits<{
  'update:modelValue': [value: { x: number; y: number }]
}>()

const containerRef = ref<HTMLElement | null>(null)

function onPickPoint(event: MouseEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
  emit('update:modelValue', { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 })
}
</script>

<style lang="scss" scoped>
.focal-point-picker {
  position: relative;
  cursor: crosshair;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  overflow: hidden;
  max-width: 200px;

  &__image {
    width: 100%;
    display: block;
    pointer-events: none;
  }

  &__marker {
    position: absolute;
    width: 20px;
    height: 20px;
    border: 2px solid white;
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2);
    transform: translate(-50%, -50%);
    pointer-events: none;
    background: rgba(255, 134, 20, 0.4);
  }
}
</style>
