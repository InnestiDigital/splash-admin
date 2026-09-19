<template>
  <div class="animation-panel">
    <div class="animation-panel__header">
      <h3 class="animation-panel__title">Animation</h3>
    </div>

    <!-- Trigger mode tabs -->
    <ul class="nav nav-tabs animation-panel__tabs" role="tablist">
      <li class="nav-item" role="presentation">
        <button
          class="nav-link"
          :class="{ active: activeTab === 'entrance' }"
          type="button"
          role="tab"
          data-testid="tab-entrance"
          @click="activeTab = 'entrance'"
        >
          Entrance
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button
          class="nav-link"
          :class="{ active: activeTab === 'hover' }"
          type="button"
          role="tab"
          data-testid="tab-hover"
          @click="activeTab = 'hover'"
        >
          Hover
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button
          class="nav-link"
          :class="{ active: activeTab === 'scroll' }"
          type="button"
          role="tab"
          data-testid="tab-scroll"
          @click="activeTab = 'scroll'"
        >
          Scroll
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button
          class="nav-link"
          :class="{ active: activeTab === 'loop' }"
          type="button"
          role="tab"
          data-testid="tab-loop"
          @click="activeTab = 'loop'"
        >
          Loop
        </button>
      </li>
    </ul>

    <!-- Tab content -->
    <div class="animation-panel__section">
      <!-- Preset radio list -->
      <div class="animation-panel__field">
        <label class="animation-panel__label">Preset</label>

        <!-- None option -->
        <div class="form-check">
          <input
            :id="`anim-preset-${activeTab}-none`"
            class="form-check-input"
            type="radio"
            :name="`anim-preset-${activeTab}`"
            value="none"
            :checked="currentPreset === 'none'"
            @change="onPresetChange('none')"
          />
          <label class="form-check-label" :for="`anim-preset-${activeTab}-none`">None</label>
        </div>

        <!-- Safe presets (entrance) or all hover presets -->
        <div
          v-for="preset in visiblePresets"
          :key="preset.id"
          class="form-check"
        >
          <input
            :id="`anim-preset-${preset.id}`"
            class="form-check-input"
            type="radio"
            :name="`anim-preset-${activeTab}`"
            :value="preset.id"
            :checked="currentPreset === preset.id"
            @change="onPresetChange(preset.id)"
          />
          <label class="form-check-label" :for="`anim-preset-${preset.id}`">{{ preset.name }}</label>
        </div>

        <!-- Expressive expander (entrance only) -->
        <template v-if="activeTab === 'entrance' && expressivePresets.length > 0">
          <button
            type="button"
            class="btn btn-link btn-sm animation-panel__show-more"
            data-testid="show-more-toggle"
            @click="showExpressive = !showExpressive"
          >
            {{ showExpressive ? '▲ Show less' : '▼ Show more' }}
          </button>

          <template v-if="showExpressive">
            <div
              v-for="preset in expressivePresets"
              :key="preset.id"
              class="form-check"
            >
              <input
                :id="`anim-preset-${preset.id}`"
                class="form-check-input"
                type="radio"
                :name="`anim-preset-${activeTab}`"
                :value="preset.id"
                :checked="currentPreset === preset.id"
                @change="onPresetChange(preset.id)"
              />
              <label class="form-check-label" :for="`anim-preset-${preset.id}`">{{ preset.name }}</label>
            </div>
          </template>
        </template>
      </div>

      <!-- Preset badge (provenance indicator) -->
      <PresetBadge
        v-if="detachmentInfo"
        :detachment="detachmentInfo"
        @revert="onRevertPreset"
      />

      <!-- Controls shown when a preset is selected -->
      <template v-if="currentPreset !== 'none'">
        <!-- Target -->
        <div class="animation-panel__field">
          <label class="animation-panel__label" for="anim-target">Target</label>
          <select
            id="anim-target"
            class="form-select form-select-sm"
            :value="localTarget"
            @change="onTargetChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="root">root</option>
            <option
              v-for="key in targetKeys"
              :key="key"
              :value="key"
            >
              {{ key }}
            </option>
          </select>
        </div>

        <!-- Scope selector (only for multiple targets) -->
        <template v-if="selectedTargetIsMultiple">
          <div class="animation-panel__field">
            <label class="animation-panel__label" for="anim-scope">Scope</label>
            <select
              id="anim-scope"
              class="form-select form-select-sm"
              data-testid="scope-selector"
              :value="localScope"
              @change="onScopeChange(($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="opt in scopeOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>

          <!-- Item index input for "Specific index" -->
          <div v-if="localScope === 'specific-index'" class="animation-panel__field">
            <label class="animation-panel__label" for="anim-item-index">Item Index</label>
            <input
              id="anim-item-index"
              type="number"
              class="form-control form-control-sm"
              data-testid="item-index-input"
              min="0"
              :value="localItemIndex"
              @change="onItemIndexChange(Number(($event.target as HTMLInputElement).value))"
            />
          </div>

          <!-- Stagger delay slider -->
          <div v-if="isStaggerScope" class="animation-panel__field">
            <label class="animation-panel__label" for="anim-stagger-delay">
              Stagger Delay: {{ localStaggerDelay }}ms
            </label>
            <input
              id="anim-stagger-delay"
              type="range"
              class="form-range"
              min="20"
              max="400"
              step="10"
              data-testid="stagger-delay-slider"
              :value="localStaggerDelay"
              @input="localStaggerDelay = Number(($event.target as HTMLInputElement).value)"
              @change="commitStaggerDelay"
            />
          </div>
        </template>

        <!-- Duration slider (not shown for scroll tab — scrub drives timing) -->
        <div v-if="activeTab !== 'scroll'" class="animation-panel__field">
          <label class="animation-panel__label" for="anim-duration">
            Duration: {{ localDuration }}ms
            <span v-if="activeTab === 'entrance' && durationInherited" class="animation-panel__inherited">
              (inherited{{ durationInheritedSource }})
            </span>
          </label>
          <input
            id="anim-duration"
            type="range"
            class="form-range"
            min="100"
            :max="activeTab === 'loop' ? 5000 : 2000"
            step="50"
            :value="localDuration"
            @input="localDuration = Number(($event.target as HTMLInputElement).value)"
            @change="commitDuration"
          />
        </div>

        <!-- Easing editor (entrance + hover — scroll and loop omit it) -->
        <div v-if="activeTab !== 'scroll' && activeTab !== 'loop'" class="animation-panel__field" data-testid="easing-editor">
          <label class="animation-panel__label" for="anim-easing">
            Easing
            <span v-if="easingInherited" class="animation-panel__inherited">
              (inherited{{ easingInheritedSource }})
            </span>
          </label>
          <KeyframeCurveEditor
            :easing="localEasing"
            :keyframes="existingMatch?.entry.keyframes ?? []"
            @update:easing="onEasingChange"
            @update:keyframes="onKeyframesChange"
          />
        </div>

        <!-- Entrance-only controls -->
        <template v-if="activeTab === 'entrance'">
          <!-- Delay slider -->
          <div class="animation-panel__field">
            <label class="animation-panel__label" for="anim-delay">
              Delay: {{ localDelay }}ms
            </label>
            <input
              id="anim-delay"
              type="range"
              class="form-range"
              min="0"
              max="2000"
              step="50"
              :value="localDelay"
              @input="localDelay = Number(($event.target as HTMLInputElement).value)"
              @change="commitDelay"
            />
          </div>

          <!-- Reduced Motion dropdown -->
          <div class="animation-panel__field">
            <label class="animation-panel__label" for="anim-reduced-motion">Reduced Motion</label>
            <select
              id="anim-reduced-motion"
              class="form-select form-select-sm"
              :value="localReducedMotion"
              @change="onReducedMotionChange(($event.target as HTMLSelectElement).value)"
            >
              <option value="inherit">Inherit</option>
              <option value="skip">Skip</option>
              <option value="fade-only">Fade Only</option>
              <option value="instant">Instant</option>
            </select>
          </div>
        </template>

        <!-- Scroll-only controls -->
        <template v-if="activeTab === 'scroll'">
          <!-- Start Anchor -->
          <div class="animation-panel__field">
            <label class="animation-panel__label">Start Anchor</label>
            <div class="animation-panel__anchor-row">
              <select
                id="anim-scroll-start-edge"
                class="form-select form-select-sm"
                data-testid="scroll-start-edge"
                :value="localStartAnchor.edge"
                @change="onStartEdgeChange(($event.target as HTMLSelectElement).value as 'top' | 'center' | 'bottom')"
              >
                <option value="top">Top</option>
                <option value="center">Center</option>
                <option value="bottom">Bottom</option>
              </select>
              <input
                id="anim-scroll-start-viewport"
                type="number"
                class="form-control form-control-sm"
                data-testid="scroll-start-viewport"
                min="0"
                max="100"
                step="1"
                :value="Math.round(localStartAnchor.viewport * 100)"
                @change="onStartViewportChange(Math.min(100, Math.max(0, Number(($event.target as HTMLInputElement).value))) / 100)"
              />
            </div>
          </div>

          <!-- End Anchor -->
          <div class="animation-panel__field">
            <label class="animation-panel__label">End Anchor</label>
            <div class="animation-panel__anchor-row">
              <select
                id="anim-scroll-end-edge"
                class="form-select form-select-sm"
                data-testid="scroll-end-edge"
                :value="localEndAnchor.edge"
                @change="onEndEdgeChange(($event.target as HTMLSelectElement).value as 'top' | 'center' | 'bottom')"
              >
                <option value="top">Top</option>
                <option value="center">Center</option>
                <option value="bottom">Bottom</option>
              </select>
              <input
                id="anim-scroll-end-viewport"
                type="number"
                class="form-control form-control-sm"
                data-testid="scroll-end-viewport"
                min="0"
                max="100"
                step="1"
                :value="Math.round(localEndAnchor.viewport * 100)"
                @change="onEndViewportChange(Math.min(100, Math.max(0, Number(($event.target as HTMLInputElement).value))) / 100)"
              />
            </div>
          </div>

          <!-- Scrub toggle -->
          <div class="animation-panel__field">
            <div class="form-check">
              <input
                id="anim-scroll-scrub"
                class="form-check-input"
                type="checkbox"
                data-testid="scroll-scrub"
                :checked="localScrub"
                @change="onScrubChange(($event.target as HTMLInputElement).checked)"
              />
              <label class="form-check-label" for="anim-scroll-scrub">Scrub</label>
            </div>
          </div>
        </template>

        <!-- Scene conditions (device/breakpoint targeting) -->
        <div v-if="existingMatch" class="animation-panel__field">
          <label class="animation-panel__label">Conditions</label>
          <SceneConditionsPanel
            :conditions="existingMatch.scene.conditions"
            @update:conditions="onConditionsChange"
          />
        </div>

        <!-- Remove button -->
        <div class="animation-panel__actions">
          <button
            type="button"
            class="btn btn-outline-danger btn-sm animation-panel__remove"
            @click="removeAnimation"
          >
            Remove Animation
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEditorStore } from '~/admin/stores/editorStore'
import { presetRegistry, entrancePresets, hoverPresets, scrollPresets, loopPresets, easingPresets } from '~/shared/features/cms/animation/presets'
import { detectDetachment, revertToPreset } from '~/shared/features/cms/animation/presetDetachment'
import PresetBadge from '~/admin/components/animation/PresetBadge.vue'
import SceneConditionsPanel from '~/admin/components/animation/SceneConditionsPanel.vue'
import KeyframeCurveEditor from '~/admin/components/animation/KeyframeCurveEditor.vue'
import type { AnimationScene, AnimationEntry, Keyframe, IntersectionTrigger, ReducedMotionMode } from '~/shared/types/animation'
import { getTriggerType } from '~/admin/composables/useMotionDetailState'
import type { PresetMeta } from '~/shared/features/cms/animation/presets'
import {
  useMotionEntryEditor,
  scopeOptions,
} from '~/admin/composables/useMotionEntryEditor'

/** Maps Keyframe interface property names (camelCase) to CSS-hyphenated animatable tokens */
const KEYFRAME_PROP_TO_TOKEN: Record<string, string> = {
  opacity: 'opacity',
  transform: 'transform',
  blur: 'blur',
  clipPath: 'clip-path',
}

/**
 * Returns subset of `presets` whose keyframe properties are all present in `animatable`.
 * When `animatable` is undefined (root target or legacy schema), all presets are returned.
 */
function presetsCompatibleWith(
  presets: PresetMeta[],
  animatable: string[] | undefined,
): PresetMeta[] {
  if (!animatable) return presets
  return presets.filter(preset => {
    const output = preset.factory()
    const required = new Set<string>()
    for (const kf of output.keyframes) {
      for (const key of Object.keys(kf) as string[]) {
        if (key === 'offset') continue
        const token = KEYFRAME_PROP_TO_TOKEN[key]
        if (token) required.add(token)
      }
    }
    return [...required].every(t => animatable.includes(t))
  })
}

const props = defineProps<{
  blockId: string
  blockType: string
  targetsSchema?: Record<string, {
    description?: string
    multiple?: boolean
    animatable?: string[]
  }>
}>()

const store = useEditorStore()

// Active tab state
const activeTab = ref<'entrance' | 'hover' | 'scroll' | 'loop'>('entrance')
const showExpressive = ref(false)

// Presets for current tab
const safeEntrancePresets = computed(() =>
  presetsCompatibleWith(
    entrancePresets.filter(p => p.group === 'safe'),
    selectedTargetAnimatable.value,
  )
)

const expressivePresets = computed(() =>
  presetsCompatibleWith(
    entrancePresets.filter(p => p.group === 'expressive'),
    selectedTargetAnimatable.value,
  )
)

const visiblePresets = computed(() => {
  const animatable = selectedTargetAnimatable.value
  if (activeTab.value === 'hover') return presetsCompatibleWith(hoverPresets, animatable)
  if (activeTab.value === 'scroll') return presetsCompatibleWith(scrollPresets, animatable)
  if (activeTab.value === 'loop') return presetsCompatibleWith(loopPresets, animatable)
  return safeEntrancePresets.value
})

// Theme-level motion defaults from theme.json
const themeMotionDefaults = computed(() => {
  return store.themeManifest?.motion ?? {}
})

/**
 * Find all scenes+entries for this block whose trigger category matches `tab`.
 * Uses `getTriggerType` from useMotionDetailState for type-safe discrimination —
 * eliminates the duplicate branching logic and the `(scene.trigger as any).event` casts.
 * Callers that need only the first result use `[0] ?? null`.
 */
function findMatchesForTab(tab: 'entrance' | 'hover' | 'scroll' | 'loop') {
  const results: { scene: AnimationScene; entry: AnimationEntry }[] = []
  for (const scene of store.scenes) {
    if (getTriggerType(scene) !== tab) continue
    for (const entry of scene.entries) {
      if (entry.target.entityId === props.blockId) {
        results.push({ scene, entry })
        break
      }
    }
  }
  return results
}

const existingMatch = computed(() => findMatchesForTab(activeTab.value)[0] ?? null)

// Preset detachment tracking
const detachmentInfo = computed(() => {
  const match = existingMatch.value
  if (!match) return null
  return detectDetachment(match.entry)
})

function onRevertPreset(): void {
  const match = existingMatch.value
  if (!match) return
  const reverted = revertToPreset(match.entry)
  if (!reverted) return
  store.updateEntry(match.scene.id, match.entry.id, {
    keyframes: reverted.keyframes,
    duration: reverted.duration,
    easing: reverted.easing,
    presetVersion: reverted.presetVersion,
  })
}

// Scene conditions
function onConditionsChange(conditions: any): void {
  const match = existingMatch.value
  if (!match) return
  store.updateScene(match.scene.id, { conditions })
}

// Whether duration/easing are inherited (entry has no explicit value)
const durationInherited = computed(() => {
  const match = existingMatch.value
  return !match || match.entry.duration == null
})

const durationInheritedSource = computed(() => {
  if (themeMotionDefaults.value.defaultDuration != null) {
    return ` from theme: ${themeMotionDefaults.value.defaultDuration}ms`
  }
  return ' from system: 500ms'
})

const easingInherited = computed(() => {
  const match = existingMatch.value
  return !match || match.entry.easing == null
})

const easingInheritedSource = computed(() => {
  if (themeMotionDefaults.value.defaultEasing != null) {
    const label = easingPresets.find(o => o.value === themeMotionDefaults.value.defaultEasing)?.label ?? themeMotionDefaults.value.defaultEasing
    return ` from theme: ${label}`
  }
  return ' from system: Gentle'
})

// Target keys from schema (excluding 'root' which is always included)
const targetKeys = computed(() => {
  if (!props.targetsSchema) return []
  return Object.keys(props.targetsSchema).filter(k => k !== 'root')
})

// Derive UI state from existing data
const currentPreset = computed(() => {
  return existingMatch.value?.entry.presetId ?? 'none'
})

// ── useMotionEntryEditor — shared local refs, sync watcher, and handlers ──
const {
  localDuration,
  localDelay,
  localTarget,
  localEasing,
  localReducedMotion,
  localScope,
  localItemIndex,
  localStaggerDelay,
  localStartAnchor,
  localEndAnchor,
  localScrub,
  isStaggerScope,
  commitDuration,
  commitDelay,
  commitStaggerDelay,
  onEasingChange,
  onReducedMotionChange,
  onScopeChange,
  onItemIndexChange,
  onScrubChange,
  onStartEdgeChange,
  onStartViewportChange,
  onEndEdgeChange,
  onEndViewportChange,
} = useMotionEntryEditor(existingMatch)

const selectedTargetAnimatable = computed<string[] | undefined>(() => {
  if (localTarget.value === 'root') return undefined   // root = fully animatable
  return props.targetsSchema?.[localTarget.value]?.animatable
})

// Whether the currently selected target has multiple: true
const selectedTargetIsMultiple = computed(() => {
  if (localTarget.value === 'root') return false
  return props.targetsSchema?.[localTarget.value]?.multiple === true
})

function generateId(): string {
  return crypto.randomUUID()
}

function createSceneAndEntry(presetId: string): void {
  const factory = presetRegistry[presetId]
  if (!factory) return

  const preset = factory()
  const sceneId = generateId()
  const entryId = generateId()

  const targetRef: AnimationEntry['target'] = {
    entityType: 'block',
    entityId: props.blockId,
    part: localTarget.value,
  }

  // Apply scope to target/entry
  if (selectedTargetIsMultiple.value) {
    if (localScope.value === 'first-only') {
      targetRef.itemIndex = 0
    } else if (localScope.value === 'specific-index') {
      targetRef.itemIndex = localItemIndex.value
    }
  }

  const entry: AnimationEntry = {
    id: entryId,
    sceneId,
    target: targetRef,
    keyframes: preset.keyframes,
    position: { type: 'absolute', ms: localDelay.value },
    duration: preset.duration ?? localDuration.value,
    easing: preset.easing ?? localEasing.value,
    presetId: preset.presetId,
    presetVersion: preset.presetVersion,
  }

  // Apply stagger settings based on scope
  if (selectedTargetIsMultiple.value) {
    if (localScope.value === 'stagger-sequential') {
      entry.staggerGroup = 'auto'
      entry.staggerDelay = localStaggerDelay.value
    } else if (localScope.value === 'stagger-cascade') {
      entry.staggerGroup = 'auto'
      entry.staggerDelay = localStaggerDelay.value
    } else if (localScope.value === 'stagger-quick') {
      entry.staggerGroup = 'auto'
      entry.staggerDelay = localStaggerDelay.value
    }
  }

  if (preset.reducedMotion) {
    entry.reducedMotion = preset.reducedMotion
  } else if (localReducedMotion.value !== 'inherit') {
    entry.reducedMotion = localReducedMotion.value as ReducedMotionMode
  }

  let scene: AnimationScene

  if (activeTab.value === 'scroll') {
    scene = {
      id: sceneId,
      pageId: store.currentPage?.id ?? '',
      versionId: '_draft',
      trigger: {
        type: 'scroll',
        anchor: {
          entityType: 'block',
          entityId: props.blockId,
          part: 'root',
        },
        start: { ...localStartAnchor.value },
        end: { ...localEndAnchor.value },
        scrub: localScrub.value,
      },
      entries: [entry],
    }
  } else if (activeTab.value === 'hover') {
    scene = {
      id: sceneId,
      pageId: store.currentPage?.id ?? '',
      versionId: '_draft',
      trigger: {
        type: 'event',
        event: 'hover',
        source: {
          entityType: 'block',
          entityId: props.blockId,
          part: localTarget.value,
        },
      },
      entries: [entry],
    }
  } else if (activeTab.value === 'loop') {
    scene = {
      id: sceneId,
      pageId: store.currentPage?.id ?? '',
      versionId: '_draft',
      trigger: {
        type: 'intersection',
        anchor: {
          entityType: 'block',
          entityId: props.blockId,
          part: 'root',
        },
        once: false,
      } as IntersectionTrigger,
      entries: [entry],
    }
  } else {
    scene = {
      id: sceneId,
      pageId: store.currentPage?.id ?? '',
      versionId: '_draft',
      trigger: {
        type: 'intersection',
        anchor: {
          entityType: 'block',
          entityId: props.blockId,
          part: 'root',
        },
        once: true,
      },
      entries: [entry],
    }
  }

  // Auto-set allowCrossBlock when trigger anchor block differs from entry target blocks
  const triggerBlockId = extractTriggerBlockId(scene)
  if (triggerBlockId !== null) {
    const entryBlockIds = new Set(scene.entries.map((e) => e.target.entityId))
    if (!entryBlockIds.has(triggerBlockId)) {
      scene.allowCrossBlock = true
    }
  }

  store.addScene(scene)
}

/**
 * Extract the block ID from a scene's trigger anchor, or null if trigger is viewport/page-level.
 */
function extractTriggerBlockId(scene: AnimationScene): string | null {
  const trigger = scene.trigger
  if (trigger.type === 'intersection') {
    return trigger.anchor.entityId
  } else if (trigger.type === 'scroll') {
    return trigger.anchor === 'viewport' ? null : trigger.anchor.entityId
  } else if (trigger.type === 'event') {
    return trigger.source === 'page' ? null : trigger.source.entityId
  }
  return null
}

function onPresetChange(value: string): void {
  // Remove ALL existing scenes for the current tab on this block. Removing just
  // the first match (existingMatch) left duplicates behind — the validator then
  // rejected the whole block's entries as `duplicate-entrance`, so nothing
  // played. This covers both the legit "replacing one preset with another" case
  // and the cleanup-of-stale-duplicates case in a single pass.
  const toRemove = findMatchesForTab(activeTab.value)
  const sceneIds = new Set(toRemove.map((m) => m.scene.id))
  for (const id of sceneIds) store.removeScene(id)

  if (value === 'none') return

  // Create new scene/entry from preset
  createSceneAndEntry(value)
}

function onTargetChange(value: string): void {
  localTarget.value = value
  const match = existingMatch.value
  if (!match) return

  const newAnimatable = value === 'root'
    ? undefined
    : props.targetsSchema?.[value]?.animatable

  if (newAnimatable) {
    const activePresetMeta = [...entrancePresets, ...hoverPresets, ...scrollPresets, ...loopPresets]
      .find(p => p.id === match.entry.presetId)
    if (activePresetMeta) {
      const compatible = presetsCompatibleWith([activePresetMeta], newAnimatable)
      if (compatible.length === 0) {
        store.removeScene(match.scene.id)
        return
      }
    }
  }

  store.updateEntry(match.scene.id, match.entry.id, {
    target: {
      entityType: 'block',
      entityId: props.blockId,
      part: value,
    },
  })
}

function onKeyframesChange(keyframes: Keyframe[]): void {
  const match = existingMatch.value
  if (!match) return
  store.updateEntry(match.scene.id, match.entry.id, {
    keyframes,
  })
}

function removeAnimation(): void {
  const match = existingMatch.value
  if (!match) return
  store.removeScene(match.scene.id)
}
</script>

<style scoped>
.animation-panel {
  padding: 0;
}

.animation-panel__header {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--cms-line);
}

.animation-panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--cms-ink-body);
}

.animation-panel__tabs {
  margin-bottom: 16px;
}

.animation-panel__section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.animation-panel__section-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--cms-ink-body);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.animation-panel__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.animation-panel__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--cms-ink-body);
}

.animation-panel__inherited {
  font-size: 11px;
  font-weight: 400;
  color: var(--cms-ink-subtle);
  font-style: italic;
}

.animation-panel__show-more {
  padding: 0;
  font-size: 12px;
  text-decoration: none;
  text-align: left;
}

.animation-panel__actions {
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--cms-line);
}

.animation-panel__remove {
  width: 100%;
}

.animation-panel__anchor-row {
  display: flex;
  gap: 8px;
}

.animation-panel__anchor-row .form-select {
  flex: 1;
}
</style>
