<template>
  <div class="motion-detail">
    <!-- 1. Back button -->
    <button
      type="button"
      class="btn btn-link btn-sm motion-detail__back"
      data-testid="detail-back"
      @click="$emit('back')"
    >
      &larr; {{ isChoreography ? 'Back to choreographies' : 'Back to motions' }}
    </button>

    <!-- ═══ CHOREOGRAPHY DETAIL ═══ -->
    <template v-if="scene && isChoreography">
      <!-- Header -->
      <div class="motion-detail__header">
        <h4 class="motion-detail__title">
          {{ choreographyName }}
        </h4>
        <p class="motion-detail__subtitle text-muted">
          {{ scene.entries.length }} blocks &middot; section: {{ sectionName }}
        </p>
      </div>

      <!-- Name input -->
      <div class="motion-detail__field">
        <label class="motion-detail__label" for="choreo-name">Name</label>
        <input
          id="choreo-name"
          type="text"
          class="form-control form-control-sm"
          data-testid="choreography-name"
          :value="choreographyName"
          @change="onChoreographyNameChange(($event.target as HTMLInputElement).value)"
        />
      </div>

      <!-- Enabled toggle -->
      <div class="motion-detail__field">
        <div class="form-check form-switch">
          <input
            id="choreo-enabled"
            class="form-check-input"
            type="checkbox"
            role="switch"
            data-testid="enabled-toggle"
            :checked="!scene.disabled"
            @change="onEnabledChange(($event.target as HTMLInputElement).checked)"
          />
          <label class="form-check-label" for="choreo-enabled">Enabled</label>
        </div>
      </div>

      <!-- Section range anchors -->
      <div class="motion-detail__field">
        <label class="motion-detail__label">Section Range</label>
      </div>
      <div class="motion-detail__field">
        <label class="motion-detail__label">Start Anchor</label>
        <div class="motion-detail__anchor-row">
          <select
            class="form-select form-select-sm"
            data-testid="scroll-start-edge"
            :value="localStartAnchor.edge"
            @change="onStartEdgeChange(($event.target as HTMLSelectElement).value as 'top' | 'center' | 'bottom')"
          >
            <option value="top">Top</option>
            <option value="center">Center</option>
            <option value="bottom">Bottom</option>
          </select>
          <select
            class="form-select form-select-sm"
            data-testid="scroll-start-viewport"
            :value="localStartAnchor.viewport"
            @change="onStartViewportChange(Number(($event.target as HTMLSelectElement).value))"
          >
            <option :value="0">0%</option>
            <option :value="0.25">25%</option>
            <option :value="0.5">50%</option>
            <option :value="0.75">75%</option>
            <option :value="0.85">85%</option>
            <option :value="1">100%</option>
          </select>
        </div>
      </div>
      <div class="motion-detail__field">
        <label class="motion-detail__label">End Anchor</label>
        <div class="motion-detail__anchor-row">
          <select
            class="form-select form-select-sm"
            data-testid="scroll-end-edge"
            :value="localEndAnchor.edge"
            @change="onEndEdgeChange(($event.target as HTMLSelectElement).value as 'top' | 'center' | 'bottom')"
          >
            <option value="top">Top</option>
            <option value="center">Center</option>
            <option value="bottom">Bottom</option>
          </select>
          <select
            class="form-select form-select-sm"
            data-testid="scroll-end-viewport"
            :value="localEndAnchor.viewport"
            @change="onEndViewportChange(Number(($event.target as HTMLSelectElement).value))"
          >
            <option :value="0">0%</option>
            <option :value="0.25">25%</option>
            <option :value="0.5">50%</option>
            <option :value="0.75">75%</option>
            <option :value="0.85">85%</option>
            <option :value="1">100%</option>
          </select>
        </div>
      </div>

      <!-- Add Block -->
      <BlockPicker
        :section-blocks="sectionBlockList"
        :existing-block-ids="existingEntryBlockIds"
        @select="onAddBlock"
      />

      <!-- Entry cards -->
      <div v-if="scene.entries.length > 0" class="motion-detail__entries">
        <ChoreographyEntryCard
          v-for="ent in scene.entries"
          :key="ent.id"
          :entry="ent"
          :block-label="getBlockLabel(ent.target.entityId)"
          :block-type="getBlockType(ent.target.entityId)"
          @update-preset="(presetId: string | undefined) => onEntryPresetChange(ent.id, presetId)"
          @update-range="(range: { start: number; end: number }) => onEntryRangeChange(ent.id, range)"
          @remove="onRemoveEntry(ent.id)"
        />
      </div>

      <!-- Preview Rail (choreography mode) -->
      <MotionPreviewRail
        :scene="scene"
        :scene-id="sceneId"
        trigger-type="scroll"
        :keyframes="scene.entries[0]?.keyframes ?? []"
        :validation-issues="sceneIssues"
        :choreography-entries="choreographyRailEntries"
      />

      <!-- Conditions -->
      <div class="motion-detail__field">
        <button
          type="button"
          class="btn btn-link btn-sm motion-detail__collapse-toggle"
          data-testid="conditions-toggle"
          @click="showConditions = !showConditions"
        >
          {{ showConditions ? '&#9650;' : '&#9660;' }} Conditions
          <span v-if="!showConditions && conditionsSummary" class="text-muted ms-1">
            ({{ conditionsSummary }})
          </span>
        </button>
        <SceneConditionsPanel
          v-if="showConditions"
          :conditions="scene.conditions"
          @update:conditions="onConditionsChange"
        />
      </div>

      <!-- Delete -->
      <div class="motion-detail__actions">
        <button
          type="button"
          class="btn btn-outline-danger btn-sm motion-detail__remove"
          data-testid="delete-scene"
          @click="onDelete"
        >
          Delete Choreography
        </button>
      </div>
    </template>

    <!-- ═══ STANDARD MOTION DETAIL ═══ -->
    <template v-else-if="scene && entry">
      <!-- 2. Header -->
      <div class="motion-detail__header">
        <h4 class="motion-detail__title">
          {{ triggerLabel }} — {{ presetLabel }}
        </h4>
        <p class="motion-detail__subtitle text-muted">
          Target: {{ entry.target.part }}
        </p>
      </div>

      <!-- 3. Enabled toggle -->
      <div class="motion-detail__field">
        <div class="form-check form-switch">
          <input
            id="motion-enabled"
            class="form-check-input"
            type="checkbox"
            role="switch"
            data-testid="enabled-toggle"
            :checked="!scene.disabled"
            @change="onEnabledChange(($event.target as HTMLInputElement).checked)"
          />
          <label class="form-check-label" for="motion-enabled">Enabled</label>
        </div>
      </div>

      <!-- 4. Target selector -->
      <div class="motion-detail__field">
        <label class="motion-detail__label" for="detail-target">Target</label>
        <select
          id="detail-target"
          class="form-select form-select-sm"
          data-testid="target-selector"
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

      <!-- 5. Preset picker -->
      <MotionPresetPicker
        :trigger-type="triggerType"
        :target-part="localTarget"
        :current-preset-id="entry.presetId"
        :targets-schema="targetsSchema"
        :motion-support="motionSupport"
        @select="onPresetChange"
      />

      <!-- 6. Type-specific controls -->

      <!-- ── ENTRANCE ── -->
      <template v-if="triggerType === 'entrance'">
        <!-- Duration slider -->
        <div class="motion-detail__field">
          <label class="motion-detail__label" for="detail-duration">
            Duration: {{ localDuration }}ms
          </label>
          <input
            id="detail-duration"
            type="range"
            class="form-range"
            min="100"
            max="2000"
            step="50"
            data-testid="duration-slider"
            :value="localDuration"
            @input="localDuration = Number(($event.target as HTMLInputElement).value)"
            @change="commitDuration"
          />
        </div>

        <!-- Easing dropdown -->
        <div class="motion-detail__field">
          <label class="motion-detail__label" for="detail-easing">Easing</label>
          <select
            id="detail-easing"
            class="form-select form-select-sm"
            data-testid="easing-select"
            :value="localEasing"
            @change="onEasingChange(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="opt in easingPresets" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <!-- Delay slider -->
        <div class="motion-detail__field">
          <label class="motion-detail__label" for="detail-delay">
            Delay: {{ localDelay }}ms
          </label>
          <input
            id="detail-delay"
            type="range"
            class="form-range"
            min="0"
            max="2000"
            step="50"
            data-testid="delay-slider"
            :value="localDelay"
            @input="localDelay = Number(($event.target as HTMLInputElement).value)"
            @change="commitDelay"
          />
        </div>

        <!-- Reduced Motion -->
        <div class="motion-detail__field">
          <label class="motion-detail__label" for="detail-reduced-motion">Reduced Motion</label>
          <select
            id="detail-reduced-motion"
            class="form-select form-select-sm"
            data-testid="reduced-motion-select"
            :value="localReducedMotion"
            @change="onReducedMotionChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="inherit">Inherit</option>
            <option value="skip">Skip</option>
            <option value="fade-only">Fade Only</option>
            <option value="instant">Instant</option>
          </select>
        </div>

        <!-- Scope selector (multiple targets only) -->
        <template v-if="selectedTargetIsMultiple">
          <div class="motion-detail__field">
            <label class="motion-detail__label" for="detail-scope">Scope</label>
            <select
              id="detail-scope"
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

          <div v-if="localScope === 'specific-index'" class="motion-detail__field">
            <label class="motion-detail__label" for="detail-item-index">Item Index</label>
            <input
              id="detail-item-index"
              type="number"
              class="form-control form-control-sm"
              data-testid="item-index-input"
              min="0"
              :value="localItemIndex"
              @change="onItemIndexChange(Number(($event.target as HTMLInputElement).value))"
            />
          </div>
        </template>
      </template>

      <!-- ── SCROLL ── -->
      <template v-else-if="triggerType === 'scroll'">
        <!-- Scrub toggle -->
        <div class="motion-detail__field">
          <div class="form-check">
            <input
              id="detail-scrub"
              class="form-check-input"
              type="checkbox"
              data-testid="scroll-scrub"
              :checked="localScrub"
              @change="onScrubChange(($event.target as HTMLInputElement).checked)"
            />
            <label class="form-check-label" for="detail-scrub">Scrub</label>
          </div>
        </div>

        <!-- Start Anchor -->
        <div class="motion-detail__field">
          <label class="motion-detail__label">Start Anchor</label>
          <div class="motion-detail__anchor-row">
            <select
              class="form-select form-select-sm"
              data-testid="scroll-start-edge"
              :value="localStartAnchor.edge"
              @change="onStartEdgeChange(($event.target as HTMLSelectElement).value as 'top' | 'center' | 'bottom')"
            >
              <option value="top">Top</option>
              <option value="center">Center</option>
              <option value="bottom">Bottom</option>
            </select>
            <select
              class="form-select form-select-sm"
              data-testid="scroll-start-viewport"
              :value="localStartAnchor.viewport"
              @change="onStartViewportChange(Number(($event.target as HTMLSelectElement).value))"
            >
              <option :value="0">0%</option>
              <option :value="0.25">25%</option>
              <option :value="0.5">50%</option>
              <option :value="0.75">75%</option>
              <option :value="0.85">85%</option>
              <option :value="1">100%</option>
            </select>
          </div>
        </div>

        <!-- End Anchor -->
        <div class="motion-detail__field">
          <label class="motion-detail__label">End Anchor</label>
          <div class="motion-detail__anchor-row">
            <select
              class="form-select form-select-sm"
              data-testid="scroll-end-edge"
              :value="localEndAnchor.edge"
              @change="onEndEdgeChange(($event.target as HTMLSelectElement).value as 'top' | 'center' | 'bottom')"
            >
              <option value="top">Top</option>
              <option value="center">Center</option>
              <option value="bottom">Bottom</option>
            </select>
            <select
              class="form-select form-select-sm"
              data-testid="scroll-end-viewport"
              :value="localEndAnchor.viewport"
              @change="onEndViewportChange(Number(($event.target as HTMLSelectElement).value))"
            >
              <option :value="0">0%</option>
              <option :value="0.25">25%</option>
              <option :value="0.5">50%</option>
              <option :value="0.75">75%</option>
              <option :value="0.85">85%</option>
              <option :value="1">100%</option>
            </select>
          </div>
        </div>

        <!-- Path knobs -->
        <div v-if="activePathPresetMeta?.knobs && activePresetCompat" class="motion-detail__field">
          <label class="motion-detail__label">Path Options</label>
          <div
            v-for="knob in activePathPresetMeta.knobs"
            :key="knob.id"
            class="motion-detail__knob-row"
          >
            <label class="motion-detail__knob-label">{{ knob.id }}</label>
            <select
              class="form-select form-select-sm"
              :class="{ 'border-warning': activePresetCompat.knobWarnings[knob.id] }"
              :value="knobValues[knob.id]"
              @change="knobValues[knob.id] = ($event.target as HTMLSelectElement).value; saveKnobs()"
            >
              <option
                v-for="opt in activePresetCompat.allowedKnobOptions[knob.id] ?? knob.options"
                :key="String(opt)"
                :value="opt"
              >{{ opt }}</option>
              <!-- Show current value even if outside allowed range -->
              <option
                v-if="knobValues[knob.id] && !(activePresetCompat.allowedKnobOptions[knob.id] ?? []).includes(knobValues[knob.id])"
                :value="knobValues[knob.id]"
                disabled
              >{{ knobValues[knob.id] }} (not recommended)</option>
            </select>
            <small
              v-if="activePresetCompat.knobWarnings[knob.id]"
              class="text-warning"
            >{{ activePresetCompat.knobWarnings[knob.id] }}</small>
          </div>
        </div>
      </template>

      <!-- ── HOVER ── -->
      <template v-else-if="triggerType === 'hover'">
        <!-- Duration slider -->
        <div class="motion-detail__field">
          <label class="motion-detail__label" for="detail-hover-duration">
            Duration: {{ localDuration }}ms
          </label>
          <input
            id="detail-hover-duration"
            type="range"
            class="form-range"
            min="100"
            max="2000"
            step="50"
            data-testid="duration-slider"
            :value="localDuration"
            @input="localDuration = Number(($event.target as HTMLInputElement).value)"
            @change="commitDuration"
          />
        </div>

        <!-- Easing dropdown -->
        <div class="motion-detail__field">
          <label class="motion-detail__label" for="detail-hover-easing">Easing</label>
          <select
            id="detail-hover-easing"
            class="form-select form-select-sm"
            data-testid="easing-select"
            :value="localEasing"
            @change="onEasingChange(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="opt in easingPresets" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
      </template>

      <!-- ── LOOP ── -->
      <template v-else-if="triggerType === 'loop'">
        <!-- Duration slider -->
        <div class="motion-detail__field">
          <label class="motion-detail__label" for="detail-loop-duration">
            Duration: {{ localDuration }}ms
          </label>
          <input
            id="detail-loop-duration"
            type="range"
            class="form-range"
            min="100"
            max="5000"
            step="100"
            data-testid="duration-slider"
            :value="localDuration"
            @input="localDuration = Number(($event.target as HTMLInputElement).value)"
            @change="commitDuration"
          />
        </div>
      </template>

      <!-- 7. Preview Rail -->
      <MotionPreviewRail
        :scene="scene"
        :scene-id="sceneId"
        :trigger-type="triggerType"
        :keyframes="entry.keyframes ?? []"
        :validation-issues="sceneIssues"
      />

      <!-- 8. Conditions (collapsible) -->
      <div class="motion-detail__field">
        <button
          type="button"
          class="btn btn-link btn-sm motion-detail__collapse-toggle"
          data-testid="conditions-toggle"
          @click="showConditions = !showConditions"
        >
          {{ showConditions ? '▲' : '▼' }} Conditions
          <span v-if="!showConditions && conditionsSummary" class="text-muted ms-1">
            ({{ conditionsSummary }})
          </span>
        </button>
        <SceneConditionsPanel
          v-if="showConditions"
          :conditions="scene.conditions"
          @update:conditions="onConditionsChange"
        />
      </div>

      <!-- 9. Delete button -->
      <div class="motion-detail__actions">
        <button
          type="button"
          class="btn btn-outline-danger btn-sm motion-detail__remove"
          data-testid="delete-scene"
          @click="onDelete"
        >
          Remove Animation
        </button>
      </div>
    </template>

    <!-- Fallback if scene not found -->
    <p v-else class="text-muted mt-2">Scene not found.</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, toRef } from 'vue'
import { useEditorStore } from '~/admin/stores/editorStore'
import { getSchemaLabel } from '~/admin/utils/labelUtils'
import { useMotionValidation } from '~/admin/composables/useMotionValidation'
import { getTriggerType } from '~/admin/composables/useMotionDetailState'
import {
  presetRegistry,
  pathPresets,
  easingPresets,
} from '~/shared/features/cms/animation/presets'
import type { AnimationEntry } from '~/shared/types/animation'
import { evaluatePresetCompatibility, normalizedTargetKind } from '~/shared/features/cms/animation/presetCompatibility'
import type { TargetMeta } from '~/shared/features/cms/animation/presetCompatibility'
import MotionPresetPicker from '~/admin/components/animation/MotionPresetPicker.vue'
import MotionPreviewRail from '~/admin/components/animation/MotionPreviewRail.vue'
import SceneConditionsPanel from '~/admin/components/animation/SceneConditionsPanel.vue'
import ChoreographyEntryCard from '~/admin/components/animation/ChoreographyEntryCard.vue'
import BlockPicker from '~/admin/components/animation/BlockPicker.vue'
import {
  useMotionEntryEditor,
  scopeOptions,
} from '~/admin/composables/useMotionEntryEditor'

const PATH_PRESET_IDS = new Set(pathPresets.map(p => p.id))

const TRIGGER_LABELS: Record<string, string> = {
  entrance: 'Entrance',
  scroll: 'Scroll',
  hover: 'Hover',
  loop: 'Loop',
}

const props = defineProps<{
  sceneId: string
  blockId: string
  targetsSchema?: Record<string, { description?: string; multiple?: boolean; animatable?: string[] }>
  motionSupport?: Record<string, any>
}>()

const emit = defineEmits<{
  back: []
}>()

const store = useEditorStore()
const { getIssuesForScene } = useMotionValidation(toRef(store, 'scenes'))

// ── Derived state ──

const scene = computed(() => store.scenes.find(s => s.id === props.sceneId))
const isChoreography = computed(() => !!scene.value?.sectionId)
const entry = computed(() => scene.value?.entries[0] ?? null)
const triggerType = computed(() => scene.value ? getTriggerType(scene.value) : 'entrance')

// ── Choreography-specific state ──

const choreographyName = computed(() =>
  scene.value?.choreographyMeta?.name || 'Untitled Choreography',
)

const sectionName = computed(() => {
  if (!scene.value?.sectionId) return ''
  const sec = store.sections.find((s: any) => s.id === scene.value!.sectionId)
  return sec?.name || 'Untitled Section'
})

const sectionBlockList = computed(() => {
  if (!scene.value?.sectionId) return []
  const blocks = store.sectionBlocks(scene.value.sectionId)
  return blocks.map((b: any) => ({ id: b.id, type: b.type, label: getBlockLabel(b.id) }))
})

const existingEntryBlockIds = computed(() =>
  (scene.value?.entries ?? []).map((e) => e.target.entityId),
)

const choreographyRailEntries = computed(() =>
  (scene.value?.entries ?? []).map((e) => ({
    blockId: e.target.entityId,
    label: getBlockLabel(e.target.entityId),
    start: e.scrollRange?.start ?? 0,
    end: e.scrollRange?.end ?? 1,
  })),
)

function getBlockLabel(blockId: string): string {
  const block = store.blocks.find((b: any) => b.id === blockId)
  if (!block) return blockId
  const schema = store.schemas[block.type]
  const label = getSchemaLabel(schema || null)
  if (label) return label
  return block.type
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c: string) => c.toUpperCase())
}

function getBlockType(blockId: string): string {
  const block = store.blocks.find((b: any) => b.id === blockId)
  return block?.type ?? ''
}

function onChoreographyNameChange(name: string) {
  const s = scene.value
  if (!s) return
  store.updateScene(props.sceneId, {
    choreographyMeta: { ...s.choreographyMeta, name },
  })
}

function onAddBlock(blockId: string) {
  const entryId = crypto.randomUUID()
  store.addEntry(props.sceneId, {
    id: entryId,
    sceneId: props.sceneId,
    target: { entityType: 'block', entityId: blockId, part: 'root' },
    keyframes: [{ offset: 0 }, { offset: 1 }],
    position: { type: 'absolute', ms: 0 },
    presetId: 'fade-up',
    scrollRange: { start: 0, end: 1 },
  })
}

function onEntryPresetChange(entryId: string, presetId: string | undefined) {
  if (!presetId) {
    store.updateEntry(props.sceneId, entryId, {
      keyframes: [],
      presetId: undefined,
      presetVersion: undefined,
    })
    return
  }
  const factory = presetRegistry[presetId]
  if (!factory) return
  const preset = factory()
  store.updateEntry(props.sceneId, entryId, {
    keyframes: preset.keyframes,
    presetId: preset.presetId,
    presetVersion: preset.presetVersion,
  })
}

function onEntryRangeChange(entryId: string, range: { start: number; end: number }) {
  store.updateEntry(props.sceneId, entryId, { scrollRange: range })
}

function onRemoveEntry(entryId: string) {
  store.removeEntry(props.sceneId, entryId)
}
const triggerLabel = computed(() => TRIGGER_LABELS[triggerType.value] ?? triggerType.value)
const sceneIssues = computed(() => getIssuesForScene(props.sceneId))

const presetLabel = computed(() => {
  if (!entry.value?.presetId) return 'Custom'
  return entry.value.presetId
})

const targetKeys = computed(() => {
  if (!props.targetsSchema) return []
  return Object.keys(props.targetsSchema).filter(k => k !== 'root')
})

const selectedTargetIsMultiple = computed(() => {
  if (localTarget.value === 'root') return false
  return props.targetsSchema?.[localTarget.value]?.multiple === true
})

// Path knobs
const knobValues = ref<Record<string, string | number>>({})

const activePathPresetMeta = computed(() => {
  const id = entry.value?.presetId
  if (!id || !PATH_PRESET_IDS.has(id)) return null
  return pathPresets.find(p => p.id === id) ?? null
})

const currentTargetMeta = computed<TargetMeta>(() => {
  const e = entry.value
  const partKey = e?.target.part ?? 'root'
  const schema = props.targetsSchema?.[partKey]
  const vars = props.motionSupport?.animatableVars?.map((v: { name: string }) => v.name) ?? []
  return {
    kind: normalizedTargetKind(schema ?? {}),
    animatable: schema?.animatable ?? [],
    targetPart: partKey,
    declaredVars: vars,
  }
})

const activePresetCompat = computed(() => {
  const meta = activePathPresetMeta.value
  if (!meta) return null
  return evaluatePresetCompatibility(meta, currentTargetMeta.value, entry.value?.presetKnobs)
})

// Conditions
const showConditions = ref(false)

const conditionsSummary = computed(() => {
  const c = scene.value?.conditions
  if (!c) return ''
  const parts: string[] = []
  if (c.minBreakpoint === 'lg') parts.push('Desktop')
  else if (c.maxBreakpoint === 'md') parts.push('Mobile')
  else if (c.minBreakpoint === 'md') parts.push('Tablet+')
  if (c.pointer === 'fine') parts.push('Mouse')
  else if (c.pointer === 'coarse') parts.push('Touch')
  return parts.join(', ')
})

// ── useMotionEntryEditor — shared local refs, sync watcher, and handlers ──
// motionMatch combines scene + entry (entries[0]) into the shape the composable expects.
// For choreography scenes this syncs scroll anchors from the trigger; for standard
// motion it syncs all entry-level fields. Both are correct behaviour.
const motionMatch = computed(() => {
  const s = scene.value
  const e = entry.value
  if (!s || !e) return null
  return { scene: s, entry: e }
})

const {
  localDuration,
  localDelay,
  localTarget,
  localEasing,
  localReducedMotion,
  localScope,
  localItemIndex,
  localStartAnchor,
  localEndAnchor,
  localScrub,
  commitDuration,
  commitDelay,
  onEasingChange,
  onReducedMotionChange,
  onScopeChange,
  onItemIndexChange,
  onScrubChange,
  onStartEdgeChange,
  onStartViewportChange,
  onEndEdgeChange,
  onEndViewportChange,
} = useMotionEntryEditor(motionMatch)

// ── Knob sync watcher (path-preset-specific, kept local) ──
watch([scene, entry], ([_s, e]) => {
  if (e && e.presetId && PATH_PRESET_IDS.has(e.presetId)) {
    initKnobValues(e.presetId, e.presetKnobs)
  } else {
    knobValues.value = {}
  }
}, { immediate: true })

// ── Handlers ──

function onEnabledChange(enabled: boolean) {
  store.updateScene(props.sceneId, { disabled: !enabled })
}

function onTargetChange(value: string) {
  localTarget.value = value
  const e = entry.value
  if (!e) return
  store.updateEntry(props.sceneId, e.id, {
    target: {
      entityType: 'block',
      entityId: props.blockId,
      part: value,
    },
  })
}

function onPresetChange(presetId: string | undefined) {
  const e = entry.value
  if (!e) return

  if (!presetId) {
    // Clear keyframes (revert to no-preset)
    store.updateEntry(props.sceneId, e.id, {
      keyframes: [],
      presetId: undefined,
      presetVersion: undefined,
    })
    return
  }

  const factory = presetRegistry[presetId]
  if (!factory) return

  // Handle path preset knobs
  let preset
  if (PATH_PRESET_IDS.has(presetId)) {
    initKnobValues(presetId)
    const pathMeta = pathPresets.find(p => p.id === presetId)
    preset = pathMeta ? pathMeta.factory(knobValues.value) : factory()
  } else {
    knobValues.value = {}
    preset = factory()
  }

  store.updateEntry(props.sceneId, e.id, {
    keyframes: preset.keyframes,
    presetId: preset.presetId,
    presetVersion: preset.presetVersion,
    ...(preset.duration != null ? { duration: preset.duration } : {}),
    ...(preset.easing != null ? { easing: preset.easing } : {}),
    ...(PATH_PRESET_IDS.has(presetId) && Object.keys(knobValues.value).length > 0
      ? { presetKnobs: { ...knobValues.value } }
      : {}),
  })
}


// Path knobs

function initKnobValues(presetId: string, existingKnobs?: Record<string, string | number>) {
  const meta = pathPresets.find(p => p.id === presetId)
  if (!meta?.knobs) { knobValues.value = {}; return }
  const defaults: Record<string, string | number> = {}
  for (const k of meta.knobs) defaults[k.id] = k.default
  knobValues.value = { ...defaults, ...(existingKnobs ?? {}) }
}

function saveKnobs() {
  const e = entry.value
  if (!e) return
  const meta = activePathPresetMeta.value
  if (!meta) return
  const preset = meta.factory(knobValues.value)
  store.updateEntry(props.sceneId, e.id, {
    keyframes: preset.keyframes,
    presetKnobs: { ...knobValues.value },
  })
}

// Conditions

function onConditionsChange(conditions: any) {
  store.updateScene(props.sceneId, { conditions })
}

// Delete

function onDelete() {
  store.removeScene(props.sceneId)
  emit('back')
}
</script>

<style scoped>
.motion-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.motion-detail__back {
  padding: 0;
  font-size: 13px;
  text-decoration: none;
  align-self: flex-start;
}

.motion-detail__header {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--cms-line);
}

.motion-detail__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--cms-ink-body);
}

.motion-detail__subtitle {
  margin: 2px 0 0;
  font-size: 12px;
}

.motion-detail__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.motion-detail__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--cms-ink-body);
}

.motion-detail__anchor-row {
  display: flex;
  gap: 8px;
}

.motion-detail__anchor-row .form-select {
  flex: 1;
}

.motion-detail__knob-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.motion-detail__knob-label {
  flex: 0 0 80px;
  font-size: 12px;
  color: var(--cms-ink-body);
  text-transform: capitalize;
}

.motion-detail__knob-row .form-select {
  flex: 1;
}

.motion-detail__collapse-toggle {
  padding: 0;
  font-size: 13px;
  text-decoration: none;
  text-align: left;
}

.motion-detail__entries {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.motion-detail__actions {
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--cms-line);
}

.motion-detail__remove {
  width: 100%;
}
</style>
