<template>
  <div
    class="timeline-editor"
    data-testid="timeline-editor"
  >
    <!-- Toolbar: zoom controls -->
    <div class="timeline-editor__toolbar">
      <button
        type="button"
        class="btn btn-sm btn-outline-secondary"
        data-testid="zoom-out"
        @click="zoomOut"
      >
        &minus;
      </button>
      <span class="timeline-editor__zoom-label" data-testid="zoom-label">
        {{ scale.toFixed(2) }}px/ms
      </span>
      <button
        type="button"
        class="btn btn-sm btn-outline-secondary"
        data-testid="zoom-in"
        @click="zoomIn"
      >
        +
      </button>
    </div>

    <!-- Timeline area -->
    <div class="timeline-editor__body" ref="bodyRef">
      <!-- Time ruler -->
      <div class="timeline-editor__ruler" data-testid="time-ruler">
        <div class="timeline-editor__ruler-track">
          <span
            v-for="ms in rulerMarkers"
            :key="ms"
            class="timeline-editor__ruler-mark"
            :style="{ left: ms * scale + 'px' }"
            data-testid="ruler-mark"
          >
            {{ ms }}ms
          </span>
        </div>
      </div>

      <!-- Tracks -->
      <div class="timeline-editor__tracks">
        <div
          v-for="scene in scenes"
          :key="scene.id"
          class="timeline-editor__track"
          :class="{ 'timeline-editor__track--selected': scene.id === selectedSceneId }"
          :data-testid="`track-${scene.id}`"
          @click.self="$emit('select-scene', scene.id)"
        >
          <!-- Track header -->
          <div
            class="timeline-editor__track-header"
            @click="$emit('select-scene', scene.id)"
          >
            <span class="timeline-editor__scene-id" :title="scene.id">
              {{ scene.id.slice(0, 8) }}
            </span>
            <span
              class="badge timeline-editor__trigger-badge"
              :class="triggerBadgeClass(scene)"
              data-testid="trigger-badge"
            >
              {{ scene.trigger.type }}
            </span>
          </div>

          <!-- Entry bars -->
          <div class="timeline-editor__track-content" :style="{ width: timelineWidth + 'px' }">
            <div
              v-for="entry in scene.entries"
              :key="entry.id"
              class="timeline-editor__entry"
              :class="[
                entryColorClass(entry),
                { 'timeline-editor__entry--selected': entry.id === selectedEntryId },
              ]"
              :style="entryStyle(scene, entry)"
              :data-testid="`entry-${entry.id}`"
              :title="`${entry.presetId ?? 'custom'} (${entryDuration(entry)}ms)`"
              @click.stop="$emit('select-entry', entry.id)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Inspector: entry details + curve editor (shown when entry selected) -->
    <div v-if="selectedEntry" class="timeline-editor__inspector" data-testid="inspector">
      <div class="timeline-editor__inspector-header">
        <span class="timeline-editor__inspector-title">
          {{ selectedEntry.presetId ?? 'Custom' }} &mdash; {{ selectedEntry.target.part }}
        </span>
        <SceneConditionsPanel
          v-if="selectedScene"
          :conditions="selectedScene.conditions"
          @update:conditions="$emit('update-conditions', selectedScene!.id, $event)"
        />
        <!-- Per-scene scrub: seeks the selected scene's WAAPI animations only -->
        <div v-if="selectedScene" class="timeline-editor__scene-scrub" data-testid="scene-scrub">
          <label class="timeline-editor__scene-scrub-label" :for="`scene-scrub-${selectedScene.id}`">
            Scrub scene
          </label>
          <input
            :id="`scene-scrub-${selectedScene.id}`"
            type="range"
            min="0"
            max="1"
            step="0.001"
            :value="sceneScrubProgress"
            class="timeline-editor__scene-scrub-range"
            @input="onSceneScrubInput(($event.target as HTMLInputElement).value)"
          />
          <span class="timeline-editor__scene-scrub-value">
            {{ Math.round(sceneScrubProgress * 100) }}%
          </span>
        </div>
      </div>
      <KeyframeCurveEditor
        :easing="selectedEntry.easing ?? 'ease-out'"
        :keyframes="selectedEntry.keyframes"
        @update:easing="$emit('update-entry-easing', selectedEntry!.id, $event)"
        @update:keyframes="$emit('update-entry-keyframes', selectedEntry!.id, $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { AnimationScene, AnimationEntry } from '~/shared/types/animation'
import KeyframeCurveEditor from '~/admin/components/animation/KeyframeCurveEditor.vue'
import SceneConditionsPanel from '~/admin/components/animation/SceneConditionsPanel.vue'

const props = withDefaults(defineProps<{
  scenes: AnimationScene[]
  selectedSceneId?: string
  selectedEntryId?: string
  pixelsPerMs?: number
}>(), {
  pixelsPerMs: 0.5,
})

const emit = defineEmits<{
  'select-scene': [sceneId: string]
  'select-entry': [entryId: string]
  'scrub-scene': [sceneId: string, progress: number]
  'update:pixelsPerMs': [value: number]
  'update-entry-easing': [entryId: string, easing: string]
  'update-entry-keyframes': [entryId: string, keyframes: any[]]
  'update-conditions': [sceneId: string, conditions: any]
}>()

const selectedScene = computed(() => {
  if (!props.selectedSceneId) return null
  return props.scenes.find(s => s.id === props.selectedSceneId) ?? null
})

const selectedEntry = computed(() => {
  if (!props.selectedEntryId) return null
  for (const scene of props.scenes) {
    const entry = scene.entries.find(e => e.id === props.selectedEntryId)
    if (entry) return entry
  }
  return null
})

const bodyRef = ref<HTMLElement | null>(null)

// Scale (pixels per ms) — local mirror of prop, synced via v-model
const scale = computed(() => props.pixelsPerMs)

const ZOOM_STEP = 0.1
const ZOOM_MIN = 0.1
const ZOOM_MAX = 5

function zoomIn(): void {
  const next = Math.min(scale.value + ZOOM_STEP, ZOOM_MAX)
  emit('update:pixelsPerMs', Math.round(next * 100) / 100)
}

function zoomOut(): void {
  const next = Math.max(scale.value - ZOOM_STEP, ZOOM_MIN)
  emit('update:pixelsPerMs', Math.round(next * 100) / 100)
}

// Ruler markers (0, 200, 400, ... up to max scene duration)
const maxMs = computed(() => {
  let max = 1000
  for (const scene of props.scenes) {
    for (const entry of scene.entries) {
      const pos = resolveEntryMs(scene, entry)
      const end = pos + entryDuration(entry)
      if (end > max) max = end
    }
  }
  return Math.ceil(max / 200) * 200
})

const rulerMarkers = computed(() => {
  const marks: number[] = []
  for (let ms = 0; ms <= maxMs.value; ms += 200) {
    marks.push(ms)
  }
  return marks
})

const timelineWidth = computed(() => maxMs.value * scale.value + 40)

// Resolve absolute ms position for an entry, handling after-entry chains
function resolveEntryMs(scene: AnimationScene, entry: AnimationEntry): number {
  if (entry.position.type === 'absolute') {
    return entry.position.ms
  }
  // after-entry: find referenced entry and sum
  const ref = scene.entries.find(e => e.id === entry.position.entryId)
  if (!ref) return 0
  return resolveEntryMs(scene, ref) + entryDuration(ref) + entry.position.offsetMs
}

function entryDuration(entry: AnimationEntry): number {
  return entry.duration || 300
}

function entryStyle(scene: AnimationScene, entry: AnimationEntry): Record<string, string> {
  const left = resolveEntryMs(scene, entry) * scale.value
  const width = entryDuration(entry) * scale.value
  return {
    left: left + 'px',
    width: width + 'px',
  }
}

// Color coding by preset category
function entryColorClass(entry: AnimationEntry): string {
  const pid = entry.presetId ?? ''
  if (pid.startsWith('hover-')) return 'timeline-editor__entry--hover'
  if (pid.startsWith('parallax') || pid.startsWith('scroll')) return 'timeline-editor__entry--scroll'
  if (pid.startsWith('mask-reveal')) return 'timeline-editor__entry--mask'
  if (pid.startsWith('blur')) return 'timeline-editor__entry--blur'
  if (pid.startsWith('fade') || pid.startsWith('scale') || pid.startsWith('reveal')) return 'timeline-editor__entry--entrance'
  return 'timeline-editor__entry--default'
}

function triggerBadgeClass(scene: AnimationScene): string {
  switch (scene.trigger.type) {
    case 'intersection': return 'bg-primary'
    case 'scroll': return 'bg-success'
    case 'event': return 'bg-warning text-dark'
    default: return 'bg-secondary'
  }
}

// Per-scene scrub progress (0–1). Reset when selection changes so each scene
// starts from 0 in the inspector.
const sceneScrubProgress = ref(0)

watch(
  () => props.selectedSceneId,
  () => {
    sceneScrubProgress.value = 0
  },
)

function onSceneScrubInput(raw: string): void {
  if (!selectedScene.value) return
  const progress = Math.max(0, Math.min(1, Number.parseFloat(raw) || 0))
  sceneScrubProgress.value = progress
  emit('scrub-scene', selectedScene.value.id, progress)
}
</script>

<style scoped>
.timeline-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  outline: none;
}

.timeline-editor__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timeline-editor__zoom-label {
  font-size: 11px;
  color: var(--cms-ink-muted);
  min-width: 70px;
  text-align: center;
}

.timeline-editor__body {
  overflow-x: auto;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  background: var(--cms-canvas);
}

.timeline-editor__ruler {
  position: sticky;
  top: 0;
  background: var(--cms-surface-subtle);
  border-bottom: 1px solid var(--cms-line);
  height: 24px;
  padding-left: 120px;
}

.timeline-editor__ruler-track {
  position: relative;
  height: 100%;
}

.timeline-editor__ruler-mark {
  position: absolute;
  top: 4px;
  font-size: 10px;
  color: var(--cms-ink-subtle);
  transform: translateX(-50%);
  white-space: nowrap;
}

.timeline-editor__tracks {
  position: relative;
}

.timeline-editor__track {
  display: grid;
  grid-template-columns: 120px 1fr;
  min-height: 36px;
  border-bottom: 1px solid var(--cms-line);
  cursor: pointer;
}

.timeline-editor__track--selected {
  background: var(--cms-accent-soft);
}

.timeline-editor__track-header {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 4px 8px;
  border-right: 1px solid var(--cms-line);
  background: var(--cms-surface-subtle);
  overflow: hidden;
}

.timeline-editor__scene-id {
  font-size: 11px;
  font-weight: 500;
  color: var(--cms-ink-body);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-editor__trigger-badge {
  font-size: 9px;
  padding: 1px 4px;
  align-self: flex-start;
}

.timeline-editor__track-content {
  position: relative;
  min-height: 36px;
}

.timeline-editor__entry {
  position: absolute;
  top: 6px;
  height: 24px;
  border-radius: 3px;
  cursor: pointer;
  opacity: 0.85;
  transition: opacity 0.1s;
  min-width: 4px;
}

.timeline-editor__entry:hover {
  opacity: 1;
}

.timeline-editor__entry--selected {
  outline: 2px solid var(--cms-accent);
  outline-offset: 1px;
  opacity: 1;
}

/* Category colors */
.timeline-editor__entry--entrance { background: #4285f4; }
.timeline-editor__entry--hover { background: #fbbc04; }
.timeline-editor__entry--scroll { background: #34a853; }
.timeline-editor__entry--mask { background: #9c27b0; }
.timeline-editor__entry--blur { background: #00bcd4; }
.timeline-editor__entry--default { background: #9e9e9e; }

/* Per-scene scrub (inspector) */
.timeline-editor__scene-scrub {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.timeline-editor__scene-scrub-label {
  font-size: 11px;
  color: var(--cms-ink-muted);
  margin: 0;
}

.timeline-editor__scene-scrub-range {
  flex: 1;
  min-width: 120px;
}

.timeline-editor__scene-scrub-value {
  font-size: 11px;
  color: var(--cms-ink-body);
  min-width: 36px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* Inspector panel */
.timeline-editor__inspector {
  border-top: 1px solid var(--cms-line);
  padding: 12px;
  display: flex;
  gap: 16px;
  background: var(--cms-surface);
}

.timeline-editor__inspector-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 180px;
}

.timeline-editor__inspector-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--cms-ink-body);
}
</style>
