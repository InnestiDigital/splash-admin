<template>
  <div ref="rootEl" class="motion-preset-picker">
    <label class="motion-preset-picker__label">Preset</label>
    <div class="dropdown">
      <button
        type="button"
        class="btn btn-sm btn-outline-secondary dropdown-toggle motion-preset-picker__trigger"
        data-testid="preset-picker-trigger"
        :aria-expanded="open"
        aria-haspopup="listbox"
        @click="open = !open"
      >
        {{ currentLabel }}
      </button>

      <ul
        v-if="open"
        class="dropdown-menu show motion-preset-picker__menu"
        data-testid="preset-picker-menu"
      >
        <!-- None option -->
        <li>
          <button
            class="dropdown-item"
            :class="{ active: !currentPresetId }"
            data-testid="preset-none"
            @click="select(undefined)"
          >
            None
          </button>
        </li>

        <li><hr class="dropdown-divider" /></li>

        <!-- Safe group -->
        <li v-if="safePresets.length > 0" class="dropdown-header">Safe</li>
        <li v-for="p in safePresets" :key="p.id">
          <button
            class="dropdown-item"
            :class="{
              active: currentPresetId === p.id,
              disabled: presetCompatMap.get(p.id)?.status === 'disabled',
            }"
            :title="presetCompatMap.get(p.id)?.status === 'disabled'
              ? presetCompatMap.get(p.id)?.reasons.join(', ')
              : undefined"
            :data-testid="'preset-' + p.id"
            @click="presetCompatMap.get(p.id)?.status !== 'disabled' && select(p.id)"
          >
            {{ p.name }}
          </button>
        </li>

        <!-- Expressive group -->
        <template v-if="expressivePresets.length > 0">
          <li><hr class="dropdown-divider" /></li>
          <li class="dropdown-header">Expressive</li>
          <li v-for="p in expressivePresets" :key="p.id">
            <button
              class="dropdown-item"
              :class="{
                active: currentPresetId === p.id,
                disabled: presetCompatMap.get(p.id)?.status === 'disabled',
              }"
              :title="presetCompatMap.get(p.id)?.status === 'disabled'
                ? presetCompatMap.get(p.id)?.reasons.join(', ')
                : undefined"
              :data-testid="'preset-' + p.id"
              @click="presetCompatMap.get(p.id)?.status !== 'disabled' && select(p.id)"
            >
              {{ p.name }}
            </button>
          </li>
        </template>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useClickOutside } from '~/admin/composables/useClickOutside'
import {
  entrancePresets,
  scrollPresets,
  hoverPresets,
  loopPresets,
  pathPresets,
} from '~/shared/features/cms/animation/presets'
import type { PresetMeta } from '~/shared/features/cms/animation/presets'
import { evaluatePresetCompatibility, normalizedTargetKind } from '~/shared/features/cms/animation/presetCompatibility'
import type { TargetMeta } from '~/shared/features/cms/animation/presetCompatibility'

const props = defineProps<{
  triggerType: 'entrance' | 'hover' | 'scroll' | 'loop'
  targetPart: string
  currentPresetId: string | undefined
  targetsSchema?: Record<string, { description?: string; multiple?: boolean; animatable?: string[]; kind?: string }>
  motionSupport?: Record<string, any>
}>()

const emit = defineEmits<{
  select: [presetId: string | undefined]
}>()

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
useClickOutside(rootEl, () => { open.value = false })

const targetMeta = computed<TargetMeta>(() => {
  const schema = props.targetsSchema?.[props.targetPart]
  const vars = props.motionSupport?.animatableVars?.map((v: { name: string }) => v.name) ?? []
  return {
    kind: normalizedTargetKind(schema ?? {}),
    animatable: schema?.animatable ?? [],
    targetPart: props.targetPart,
    declaredVars: vars,
  }
})

/** All presets for current trigger type */
const allPresetsForType = computed<PresetMeta[]>(() => {
  switch (props.triggerType) {
    case 'entrance': return entrancePresets
    case 'hover': return hoverPresets
    case 'scroll': return [...scrollPresets, ...pathPresets]
    case 'loop': return loopPresets
    default: return []
  }
})

const presetCompatMap = computed(() => {
  const map = new Map<string, ReturnType<typeof evaluatePresetCompatibility>>()
  for (const preset of allPresetsForType.value) {
    map.set(preset.id, evaluatePresetCompatibility(preset, targetMeta.value))
  }
  return map
})

const visiblePresets = computed(() =>
  allPresetsForType.value.filter(p => {
    const compat = presetCompatMap.value.get(p.id)
    return compat && compat.status !== 'hidden'
  }),
)

const safePresets = computed(() =>
  visiblePresets.value.filter(p => p.group === 'safe'),
)

const expressivePresets = computed(() =>
  visiblePresets.value.filter(p => p.group === 'expressive'),
)

const currentLabel = computed(() => {
  if (!props.currentPresetId) return 'None'
  const found = allPresetsForType.value.find(p => p.id === props.currentPresetId)
  return found?.name ?? props.currentPresetId
})

function select(presetId: string | undefined) {
  open.value = false
  emit('select', presetId)
}
</script>

<style scoped>
.motion-preset-picker {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.motion-preset-picker__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--cms-ink-body);
}

.motion-preset-picker .dropdown {
  position: relative;
}

.motion-preset-picker__trigger {
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.motion-preset-picker__menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 10;
  max-height: 300px;
  overflow-y: auto;
  width: 100%;
}
</style>
