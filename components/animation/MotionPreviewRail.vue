<template>
  <div class="motion-preview-rail" data-testid="preview-rail">
    <template v-if="choreographyEntries && choreographyEntries.length > 0">
      <label class="motion-preview-rail__label">
        Preview Rail &middot; {{ choreographyEntries.length }} blocks
      </label>
      <div class="motion-preview-rail__bands" data-testid="choreography-bands">
        <div
          v-for="(band, idx) in choreographyEntries"
          :key="band.blockId"
          class="motion-preview-rail__band-row"
        >
          <div class="motion-preview-rail__band-track">
            <div
              class="motion-preview-rail__band-fill"
              :style="bandStyle(band, idx)"
            />
          </div>
          <span class="motion-preview-rail__band-label">{{ band.label }}</span>
        </div>
      </div>
      <div class="motion-preview-rail__track">
        <input
          type="range"
          class="form-range"
          min="0"
          max="100"
          step="1"
          :value="scrubPosition"
          data-testid="scrub-slider"
          @input="onScrub(Number(($event.target as HTMLInputElement).value))"
        />
      </div>
    </template>

    <template v-else-if="triggerType === 'scroll'">
      <label class="motion-preview-rail__label">
        Preview Scrub: {{ scrubPosition }}%
      </label>
      <div class="motion-preview-rail__track">
        <input
          type="range"
          class="form-range"
          min="0"
          max="100"
          step="1"
          :value="scrubPosition"
          data-testid="scrub-slider"
          @input="onScrub(Number(($event.target as HTMLInputElement).value))"
        />
        <div class="motion-preview-rail__dots">
          <span
            v-for="(kf, i) in keyframes"
            :key="i"
            class="motion-preview-rail__dot"
            :style="{ left: (kf.offset ?? 0) * 100 + '%' }"
            :title="'Keyframe at ' + ((kf.offset ?? 0) * 100).toFixed(0) + '%'"
          />
        </div>
      </div>
    </template>

    <template v-else-if="triggerType === 'entrance'">
      <div class="motion-preview-rail__buttons">
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          data-testid="preview-play"
          @click="sendPreviewCommand('play')"
        >
          Play
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          data-testid="preview-replay"
          @click="sendPreviewCommand('replay')"
        >
          Replay
        </button>
      </div>
    </template>

    <template v-else-if="triggerType === 'hover'">
      <div class="motion-preview-rail__buttons">
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          data-testid="preview-hover-in"
          @click="sendPreviewCommand('hover-in')"
        >
          Hover In
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          data-testid="preview-hover-out"
          @click="sendPreviewCommand('hover-out')"
        >
          Hover Out
        </button>
      </div>
    </template>

    <template v-else-if="triggerType === 'loop'">
      <div class="motion-preview-rail__buttons">
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          data-testid="preview-loop-play"
          @click="sendPreviewCommand('play')"
        >
          Play
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          data-testid="preview-loop-pause"
          @click="sendPreviewCommand('pause')"
        >
          Pause
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          data-testid="preview-loop-restart"
          @click="sendPreviewCommand('restart')"
        >
          Restart
        </button>
      </div>
    </template>

    <div
      v-if="validationIssues.length > 0"
      class="motion-preview-rail__warnings"
      data-testid="preview-warnings"
    >
      <div
        v-for="issue in validationIssues"
        :key="issue.code"
        class="motion-preview-rail__warning"
      >
        {{ issue.message }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useEditorStore } from '~/admin/stores/editorStore'
import { useCmsPreview } from '~/shared/composables/useCmsPreview'
import type { AnimationScene, Keyframe } from '~/shared/types/animation'
import type { SceneCommand } from '~/shared/types/previewMessages'
import type { ValidationIssue } from '~/shared/features/cms/animation/sceneValidation'

export interface ChoreographyRailEntry {
  blockId: string
  label: string
  start: number
  end: number
}

const props = defineProps<{
  scene?: AnimationScene | null
  sceneId?: string
  triggerType: 'entrance' | 'hover' | 'scroll' | 'loop'
  keyframes: Keyframe[]
  validationIssues: ValidationIssue[]
  choreographyEntries?: ChoreographyRailEntry[]
}>()

const BAND_COLORS = ['#0d6efd', '#198754', '#ffc107', '#dc3545', '#6f42c1', '#0dcaf0', '#fd7e14', '#6610f2']

const store = useEditorStore()
const { sendPreviewScene, sendSceneScrub, sendSceneCommand } = useCmsPreview()
const scrubPosition = ref(0)
let sceneDebounceTimer: ReturnType<typeof setTimeout> | null = null

const currentScene = computed(() => {
  if (props.scene) {
    return props.scene
  }

  if (props.sceneId) {
    return store.scenes.find(scene => scene.id === props.sceneId) ?? null
  }

  if (store.selectedSceneId) {
    return store.scenes.find(scene => scene.id === store.selectedSceneId) ?? null
  }

  return null
})

const currentSceneId = computed(() => currentScene.value?.id ?? props.sceneId ?? '')
const keyframes = computed(() => props.keyframes?.length ? props.keyframes : currentScene.value?.entries[0]?.keyframes ?? [])

// Watch scene content via a JSON-keyed source so the watcher only fires when
// the scene data actually changes, not on every reactive access. The initial
// (immediate) fire sends without delay so the preview gets the scene on mount;
// subsequent changes are debounced to 150 ms to coalesce rapid mutations (e.g.
// keyframe drag ticks, duration slider input events) into a single postMessage.
watch(
  () => (currentScene.value ? JSON.stringify(currentScene.value) : null),
  (hash, oldHash) => {
    if (!hash) return
    if (sceneDebounceTimer) clearTimeout(sceneDebounceTimer)
    if (oldHash === undefined) {
      // Immediate mount: send right away — no debounce window needed here.
      sendPreviewScene(currentScene.value!)
    } else {
      sceneDebounceTimer = setTimeout(() => {
        if (currentScene.value) sendPreviewScene(currentScene.value)
      }, 150)
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (sceneDebounceTimer) clearTimeout(sceneDebounceTimer)
})

function bandStyle(band: ChoreographyRailEntry, idx: number) {
  const color = BAND_COLORS[idx % BAND_COLORS.length]
  return {
    left: `${band.start * 100}%`,
    width: `${(band.end - band.start) * 100}%`,
    background: color,
  }
}

function sendPreviewCommand(command: SceneCommand) {
  const sceneId = currentSceneId.value
  if (!sceneId) {
    return
  }

  if (currentScene.value) {
    sendPreviewScene(currentScene.value)
  }

  sendSceneCommand(sceneId, command)
}

function onScrub(value: number) {
  scrubPosition.value = value

  const sceneId = currentSceneId.value
  if (!sceneId) {
    return
  }

  // The scene watcher keeps the preview in sync — only the scrub position is
  // needed per tick. Sending the full scene here was the primary source of
  // postMessage flooding during drag (2 messages/pixel → 1).
  sendSceneScrub(sceneId, value / 100)
}
</script>

<style scoped>
.motion-preview-rail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0;
}

.motion-preview-rail__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--cms-ink-body);
}

.motion-preview-rail__track {
  position: relative;
}

.motion-preview-rail__dots {
  position: relative;
  height: 6px;
  margin-top: -4px;
  pointer-events: none;
}

.motion-preview-rail__dot {
  position: absolute;
  top: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cms-accent);
  transform: translateX(-50%);
}

.motion-preview-rail__buttons {
  display: flex;
  gap: 6px;
}

.motion-preview-rail__warnings {
  padding: 6px 8px;
  background: var(--cms-warn-soft);
  border: 1px solid #ffc107;
  border-radius: 4px;
  font-size: 12px;
  color: var(--cms-warn);
}

.motion-preview-rail__warning {
  line-height: 1.4;
}

.motion-preview-rail__bands {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.motion-preview-rail__band-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.motion-preview-rail__band-track {
  position: relative;
  flex: 1;
  height: 8px;
  background: var(--cms-surface-sunken);
  border-radius: 4px;
  overflow: hidden;
}

.motion-preview-rail__band-fill {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: 4px;
  min-width: 2px;
  opacity: 0.8;
}

.motion-preview-rail__band-label {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--cms-ink-body);
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
