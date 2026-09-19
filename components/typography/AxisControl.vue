<template>
  <div class="axis-control">
    <div class="axis-control__header">
      <label class="axis-control__label">
        {{ axis.label || axis.tag }}
        <span v-if="axis.experimental" class="axis-control__badge" title="Experimental axis">⚠ experimental</span>
      </label>
      <button
        v-if="!atDefault"
        type="button"
        data-action="reset"
        class="axis-control__reset"
        @click="$emit('reset')"
      >Reset</button>
    </div>

    <!-- Binary axis → toggle -->
    <div v-if="isBinary" class="axis-control__toggle">
      <label>
        <input
          type="checkbox"
          :checked="modelValue === 1"
          @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked ? 1 : 0)"
        />
        <span>{{ modelValue === 1 ? 'On' : 'Off' }}</span>
      </label>
    </div>

    <!-- Continuous axis → slider + numeric -->
    <div v-else class="axis-control__continuous">
      <input
        type="range"
        :min="axis.min" :max="axis.max" :step="axis.step ?? 1"
        :value="modelValue"
        @input="onSlider"
      />
      <input
        type="number"
        :min="axis.min" :max="axis.max" :step="axis.step ?? 1"
        :value="modelValue"
        @input="onNumeric"
      />
      <span class="axis-control__hint">({{ axis.min }}–{{ axis.max }})</span>
    </div>

    <p v-if="outOfRangeMessage" class="axis-control__warning">{{ outOfRangeMessage }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface AxisProp {
  tag: string
  label?: string
  min: number
  max: number
  default: number
  step?: number
  experimental?: boolean
}

const props = defineProps<{
  axis: AxisProp
  modelValue: number
  /** Original stored value before clamp; defaults to modelValue (no warning). */
  storedValue?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
  'reset': []
}>()

const isBinary = computed(() =>
  props.axis.min === 0 && props.axis.max === 1 && (props.axis.step ?? 1) === 1
)
const atDefault = computed(() => props.modelValue === props.axis.default)
const outOfRangeMessage = computed(() => {
  const stored = props.storedValue
  if (stored === undefined || stored === props.modelValue) return null
  return `Stored value ${stored} is outside the current font's range ${props.axis.min}–${props.axis.max}; rendering at ${props.modelValue}.`
})

function onSlider(e: Event) {
  emit('update:modelValue', parseFloat((e.target as HTMLInputElement).value))
}
function onNumeric(e: Event) {
  emit('update:modelValue', parseFloat((e.target as HTMLInputElement).value))
}
</script>

<style scoped>
.axis-control { display: grid; gap: 0.25rem; padding: 0.5rem 0; }
.axis-control__header { display: flex; justify-content: space-between; align-items: center; }
.axis-control__label { font-size: 0.85rem; font-weight: 500; }
.axis-control__badge { margin-left: 0.5rem; font-size: 0.7rem; color: var(--cms-warn); }
.axis-control__reset { background: none; border: 1px solid var(--cms-line); padding: 0.1rem 0.4rem; font-size: 0.75rem; cursor: pointer; }
.axis-control__continuous { display: grid; grid-template-columns: 1fr 4rem auto; gap: 0.5rem; align-items: center; }
.axis-control__hint { color: var(--cms-ink-subtle); font-size: 0.75rem; }
.axis-control__warning { color: var(--cms-warn); font-size: 0.75rem; margin: 0; }
</style>
