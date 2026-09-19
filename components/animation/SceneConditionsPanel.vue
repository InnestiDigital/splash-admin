<template>
  <div class="scene-conditions-panel">
    <div class="scene-conditions-panel__field">
      <label class="scene-conditions-panel__label" for="condition-device">Show on</label>
      <select
        id="condition-device"
        class="form-select form-select-sm"
        data-testid="device-selector"
        :value="devicePreset"
        @change="onDeviceChange(($event.target as HTMLSelectElement).value)"
      >
        <option value="all">All devices</option>
        <option value="desktop">Desktop only</option>
        <option value="mobile">Mobile only</option>
        <option value="tablet-up">Tablet+</option>
      </select>
    </div>

    <div class="scene-conditions-panel__field">
      <label class="scene-conditions-panel__label" for="condition-pointer">Pointer type</label>
      <select
        id="condition-pointer"
        class="form-select form-select-sm"
        data-testid="pointer-selector"
        :value="pointerPreset"
        @change="onPointerChange(($event.target as HTMLSelectElement).value)"
      >
        <option value="any">Any</option>
        <option value="fine">Mouse devices only</option>
        <option value="coarse">Touch devices only</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SceneConditions } from '~/shared/types/animation'

const props = defineProps<{
  conditions?: SceneConditions
}>()

const emit = defineEmits<{
  'update:conditions': [conditions: SceneConditions | undefined]
}>()

type DevicePreset = 'all' | 'desktop' | 'mobile' | 'tablet-up'

const DEVICE_MAP: Record<DevicePreset, Partial<Pick<SceneConditions, 'minBreakpoint' | 'maxBreakpoint'>>> = {
  'all': {},
  'desktop': { minBreakpoint: 'lg' },
  'mobile': { maxBreakpoint: 'md' },
  'tablet-up': { minBreakpoint: 'md' },
}

const devicePreset = computed<DevicePreset>(() => {
  const c = props.conditions
  if (!c) return 'all'
  if (c.minBreakpoint === 'lg' && !c.maxBreakpoint) return 'desktop'
  if (c.maxBreakpoint === 'md' && !c.minBreakpoint) return 'mobile'
  if (c.minBreakpoint === 'md' && !c.maxBreakpoint) return 'tablet-up'
  return 'all'
})

const pointerPreset = computed(() => {
  return props.conditions?.pointer ?? 'any'
})

function buildConditions(device: DevicePreset, pointer: string): SceneConditions | undefined {
  const bp = DEVICE_MAP[device]
  const result: SceneConditions = {}

  if (bp.minBreakpoint) result.minBreakpoint = bp.minBreakpoint
  if (bp.maxBreakpoint) result.maxBreakpoint = bp.maxBreakpoint
  if (pointer === 'fine' || pointer === 'coarse') result.pointer = pointer

  // Return undefined if empty (= all devices, any pointer)
  if (Object.keys(result).length === 0) return undefined
  return result
}

function onDeviceChange(value: string): void {
  emit('update:conditions', buildConditions(value as DevicePreset, pointerPreset.value))
}

function onPointerChange(value: string): void {
  emit('update:conditions', buildConditions(devicePreset.value, value))
}
</script>

<style scoped>
.scene-conditions-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scene-conditions-panel__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.scene-conditions-panel__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--cms-ink-body);
}
</style>
