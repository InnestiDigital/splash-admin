<template>
  <div class="curve-editor">
    <!-- Bezier Curve Editor -->
    <div class="curve-editor__section">
      <label class="curve-editor__label">Easing Curve</label>

      <!-- Preset selector -->
      <select
        class="form-select form-select-sm curve-editor__preset"
        data-testid="easing-preset"
        :value="activePresetId"
        @change="onPresetChange(($event.target as HTMLSelectElement).value)"
      >
        <option value="custom">Custom</option>
        <option
          v-for="preset in allPresets"
          :key="preset.id"
          :value="preset.id"
        >
          {{ preset.label }}
        </option>
      </select>

      <!-- SVG bezier curve -->
      <svg
        ref="curveSvgRef"
        class="curve-editor__svg"
        data-testid="bezier-svg"
        viewBox="0 0 200 200"
        @mousedown="onSvgMouseDown"
      >
        <!-- Grid lines -->
        <line x1="0" y1="0" x2="0" y2="200" class="curve-editor__grid" />
        <line x1="200" y1="0" x2="200" y2="200" class="curve-editor__grid" />
        <line x1="0" y1="0" x2="200" y2="0" class="curve-editor__grid" />
        <line x1="0" y1="200" x2="200" y2="200" class="curve-editor__grid" />
        <!-- Diagonal guide -->
        <line x1="0" y1="200" x2="200" y2="0" class="curve-editor__guide" />

        <!-- Control point handles (lines from anchor to control point) -->
        <line
          :x1="0" :y1="200"
          :x2="p1.x" :y2="p1.y"
          class="curve-editor__handle-line"
        />
        <line
          :x1="200" :y1="0"
          :x2="p2.x" :y2="p2.y"
          class="curve-editor__handle-line"
        />

        <!-- Cubic bezier curve path -->
        <path
          :d="curvePath"
          class="curve-editor__curve"
          data-testid="bezier-path"
        />

        <!-- Preview dot -->
        <circle
          v-if="previewActive"
          :cx="previewPoint.x"
          :cy="previewPoint.y"
          r="5"
          class="curve-editor__preview-dot"
          data-testid="preview-dot"
        />

        <!-- Control point P1 -->
        <circle
          :cx="p1.x"
          :cy="p1.y"
          r="8"
          class="curve-editor__control-point curve-editor__control-point--p1"
          data-testid="control-p1"
          @mousedown.stop="startDrag('p1', $event)"
        />

        <!-- Control point P2 -->
        <circle
          :cx="p2.x"
          :cy="p2.y"
          r="8"
          class="curve-editor__control-point curve-editor__control-point--p2"
          data-testid="control-p2"
          @mousedown.stop="startDrag('p2', $event)"
        />
      </svg>

      <!-- Easing string input -->
      <div class="curve-editor__input-row">
        <input
          type="text"
          class="form-control form-control-sm"
          data-testid="easing-input"
          :value="easingString"
          @change="onEasingInputChange(($event.target as HTMLInputElement).value)"
        />
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm"
          data-testid="preview-btn"
          @click="togglePreview"
        >
          {{ previewActive ? 'Stop' : 'Preview' }}
        </button>
      </div>
    </div>

    <!-- Keyframe Property Graph -->
    <div v-if="keyframes.length > 0" class="curve-editor__section">
      <label class="curve-editor__label">Keyframe Graph</label>

      <!-- Property toggles -->
      <div class="curve-editor__property-toggles">
        <button
          v-for="prop in graphProperties"
          :key="prop.key"
          type="button"
          class="btn btn-sm curve-editor__prop-btn"
          :class="{
            'btn-outline-secondary': activeProperty !== prop.key,
            'btn-primary': activeProperty === prop.key,
          }"
          :data-testid="`prop-toggle-${prop.key}`"
          :style="{ borderColor: prop.color, color: activeProperty === prop.key ? '#fff' : prop.color }"
          @click="$emit('update:activeProperty', prop.key)"
        >
          {{ prop.label }}
        </button>
      </div>

      <!-- Property graph SVG -->
      <svg
        ref="graphSvgRef"
        class="curve-editor__graph-svg"
        data-testid="keyframe-graph"
        viewBox="0 0 300 150"
        @click="onGraphClick"
        @keydown.delete="onGraphDelete"
        tabindex="0"
      >
        <!-- X-axis (time) -->
        <line x1="0" y1="150" x2="300" y2="150" class="curve-editor__axis" />
        <!-- Y-axis (value) -->
        <line x1="0" y1="0" x2="0" y2="150" class="curve-editor__axis" />

        <!-- Axis labels -->
        <text x="0" y="148" class="curve-editor__axis-label">0</text>
        <text x="290" y="148" class="curve-editor__axis-label">1</text>

        <!-- Property lines -->
        <polyline
          v-for="prop in graphProperties"
          :key="prop.key"
          :points="getPropertyPoints(prop.key)"
          fill="none"
          :stroke="prop.color"
          :stroke-width="activeProperty === prop.key ? 2.5 : 1.5"
          :opacity="activeProperty && activeProperty !== prop.key ? 0.3 : 1"
          :data-testid="`graph-line-${prop.key}`"
        />

        <!-- Keyframe points -->
        <template v-for="(kf, idx) in keyframes" :key="idx">
          <circle
            v-for="prop in visiblePropertiesForKeyframe(kf)"
            :key="`${idx}-${prop.key}`"
            :cx="kf.offset * 300"
            :cy="getPropertyY(kf, prop.key)"
            r="5"
            :fill="prop.color"
            :stroke="selectedKeyframeIndex === idx && activeProperty === prop.key ? '#fff' : 'none'"
            :stroke-width="2"
            class="curve-editor__keyframe-point"
            :data-testid="`kf-point-${idx}-${prop.key}`"
            @mousedown.stop="startKeyframeDrag(idx, prop.key, $event)"
            @click.stop="selectKeyframe(idx)"
          />
        </template>

        <!-- Rejection feedback pulse -->
        <g
          v-if="rejectionPulse"
          :key="rejectionPulse.key"
          class="curve-editor__rejection-pulse"
        >
          <circle
            :cx="rejectionPulse.x"
            :cy="rejectionPulse.y"
            r="10"
            fill="none"
            stroke="#fa5252"
            stroke-width="1.5"
            class="curve-editor__rejection-ring"
          />
          <text
            :x="rejectionPulse.x"
            :y="rejectionPulse.y - 14"
            class="curve-editor__rejection-text"
          >Too close</text>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import type { Keyframe } from '~/shared/types/animation'
import { easingPresets } from '~/shared/features/cms/animation/presets/easings'

// ---------------------------------------------------------------------------
// Props & Emits
// ---------------------------------------------------------------------------

const props = withDefaults(defineProps<{
  easing: string
  keyframes: Keyframe[]
  activeProperty?: string
}>(), {
  activeProperty: undefined,
})

const emit = defineEmits<{
  'update:easing': [value: string]
  'update:keyframes': [value: Keyframe[]]
  'update:activeProperty': [value: string]
}>()

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface GraphProperty {
  key: string
  label: string
  color: string
  min: number
  max: number
  extract: (kf: Keyframe) => number | undefined
}

const graphProperties: GraphProperty[] = [
  { key: 'opacity', label: 'Opacity', color: '#4dabf7', min: 0, max: 1, extract: (kf) => kf.opacity },
  {
    key: 'x', label: 'X', color: '#51cf66', min: -200, max: 200,
    extract: (kf) => {
      const m = kf.transform?.x?.match(/^(-?[\d.]+)px$/)
      return m ? parseFloat(m[1]) : undefined
    },
  },
  {
    key: 'y', label: 'Y', color: '#fcc419', min: -200, max: 200,
    extract: (kf) => {
      const m = kf.transform?.y?.match(/^(-?[\d.]+)px$/)
      return m ? parseFloat(m[1]) : undefined
    },
  },
  { key: 'scale', label: 'Scale', color: '#ff6b6b', min: 0, max: 2, extract: (kf) => kf.transform?.scale },
  {
    key: 'rotate', label: 'Rotate', color: '#cc5de8', min: -360, max: 360,
    extract: (kf) => {
      const m = kf.transform?.rotate?.match(/^(-?[\d.]+)deg$/)
      return m ? parseFloat(m[1]) : undefined
    },
  },
]

/** Standard CSS easings + project easings mapped to bezier coordinates */
const PRESET_COORDS: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {
  ease: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
  'ease-in': { x1: 0.42, y1: 0, x2: 1, y2: 1 },
  'ease-out': { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  'ease-in-out': { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
  linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
}

// Map project easings by parsing their cubic-bezier strings
for (const preset of easingPresets) {
  const parsed = parseCubicBezier(preset.value)
  if (parsed) {
    PRESET_COORDS[preset.id] = parsed
  }
}

const allPresets = computed(() => {
  const standard = [
    { id: 'ease', label: 'Ease' },
    { id: 'ease-in', label: 'Ease In' },
    { id: 'ease-out', label: 'Ease Out' },
    { id: 'ease-in-out', label: 'Ease In Out' },
    { id: 'linear', label: 'Linear' },
  ]
  const project = easingPresets.map(p => ({ id: p.id, label: p.label }))
  return [...standard, ...project]
})

// ---------------------------------------------------------------------------
// Bezier control points (SVG coordinates: x 0-200, y 0-200, y inverted)
// ---------------------------------------------------------------------------

const p1 = ref({ x: 50, y: 180 })
const p2 = ref({ x: 50, y: 0 })

const curveSvgRef = ref<SVGSVGElement | null>(null)
const graphSvgRef = ref<SVGSVGElement | null>(null)

// ---------------------------------------------------------------------------
// Easing string <-> control points sync
// ---------------------------------------------------------------------------

function parseCubicBezier(str: string): { x1: number; y1: number; x2: number; y2: number } | null {
  const m = str.match(/cubic-bezier\(\s*([\d.]+)\s*,\s*([\d.e-]+)\s*,\s*([\d.]+)\s*,\s*([\d.e-]+)\s*\)/)
  if (!m) return null
  return { x1: parseFloat(m[1]), y1: parseFloat(m[2]), x2: parseFloat(m[3]), y2: parseFloat(m[4]) }
}

function coordsToSvg(x1: number, y1: number, x2: number, y2: number) {
  return {
    p1: { x: Math.round(x1 * 200), y: Math.round(200 - y1 * 200) },
    p2: { x: Math.round(x2 * 200), y: Math.round(200 - y2 * 200) },
  }
}

function svgToCoords() {
  const x1 = +(p1.value.x / 200).toFixed(2)
  const y1 = +((200 - p1.value.y) / 200).toFixed(2)
  const x2 = +(p2.value.x / 200).toFixed(2)
  const y2 = +((200 - p2.value.y) / 200).toFixed(2)
  return { x1, y1, x2, y2 }
}

const easingString = computed(() => {
  const { x1, y1, x2, y2 } = svgToCoords()
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`
})

const curvePath = computed(() => {
  return `M 0,200 C ${p1.value.x},${p1.value.y} ${p2.value.x},${p2.value.y} 200,0`
})

// Detect which preset matches current control points
const activePresetId = computed(() => {
  const { x1, y1, x2, y2 } = svgToCoords()
  for (const preset of allPresets.value) {
    const coords = PRESET_COORDS[preset.id]
    if (!coords) continue
    if (
      Math.abs(coords.x1 - x1) < 0.02 &&
      Math.abs(coords.y1 - y1) < 0.02 &&
      Math.abs(coords.x2 - x2) < 0.02 &&
      Math.abs(coords.y2 - y2) < 0.02
    ) {
      return preset.id
    }
  }
  return 'custom'
})

// Sync from prop to control points on mount and easing changes
watch(() => props.easing, (val) => {
  const parsed = parseCubicBezier(val)
  if (parsed) {
    const svg = coordsToSvg(parsed.x1, parsed.y1, parsed.x2, parsed.y2)
    p1.value = svg.p1
    p2.value = svg.p2
  } else {
    // Try named easing
    const coords = PRESET_COORDS[val]
    if (coords) {
      const svg = coordsToSvg(coords.x1, coords.y1, coords.x2, coords.y2)
      p1.value = svg.p1
      p2.value = svg.p2
    }
  }
}, { immediate: true })

// ---------------------------------------------------------------------------
// Preset selection
// ---------------------------------------------------------------------------

function onPresetChange(presetId: string) {
  if (presetId === 'custom') return
  const coords = PRESET_COORDS[presetId]
  if (!coords) return
  const svg = coordsToSvg(coords.x1, coords.y1, coords.x2, coords.y2)
  p1.value = svg.p1
  p2.value = svg.p2
  emit('update:easing', `cubic-bezier(${coords.x1}, ${coords.y1}, ${coords.x2}, ${coords.y2})`)
}

function onEasingInputChange(val: string) {
  const parsed = parseCubicBezier(val)
  if (parsed) {
    const svg = coordsToSvg(parsed.x1, parsed.y1, parsed.x2, parsed.y2)
    p1.value = svg.p1
    p2.value = svg.p2
    emit('update:easing', val)
  }
}

// ---------------------------------------------------------------------------
// Control point dragging
// ---------------------------------------------------------------------------

let dragTarget: 'p1' | 'p2' | null = null
let dragStartP1 = { x: 0, y: 0 }
let dragStartP2 = { x: 0, y: 0 }

function removeDragListeners() {
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', onDragEnd)
  document.removeEventListener('keydown', onDragKeydown)
  document.removeEventListener('contextmenu', onDragEnd)
  window.removeEventListener('blur', onDragEnd)
}

function startDrag(target: 'p1' | 'p2', event: MouseEvent) {
  dragStartP1 = { ...p1.value }
  dragStartP2 = { ...p2.value }
  dragTarget = target
  event.preventDefault()
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', onDragEnd)
  document.addEventListener('keydown', onDragKeydown)
  document.addEventListener('contextmenu', onDragEnd)
  window.addEventListener('blur', onDragEnd)
}

function onDrag(event: MouseEvent) {
  if (!dragTarget || !curveSvgRef.value) return
  const svg = curveSvgRef.value
  const rect = svg.getBoundingClientRect()
  const x = Math.round(((event.clientX - rect.left) / rect.width) * 200)
  const y = Math.round(((event.clientY - rect.top) / rect.height) * 200)

  const clamped = {
    x: Math.max(0, Math.min(200, x)),
    y: Math.max(-50, Math.min(250, y)), // allow slight overshoot for bouncy curves
  }

  if (dragTarget === 'p1') {
    p1.value = clamped
  } else {
    p2.value = clamped
  }
}

function onDragEnd() {
  if (dragTarget) {
    emit('update:easing', easingString.value)
  }
  removeDragListeners()
  dragTarget = null
}

function onDragKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    // Revert visual state without emitting
    p1.value = { ...dragStartP1 }
    p2.value = { ...dragStartP2 }
    removeDragListeners()
    dragTarget = null
  }
}

function onSvgMouseDown(_event: MouseEvent) {
  // Only start drag if clicking on a control point (handled by circle mousedown)
}

// ---------------------------------------------------------------------------
// Preview animation
// ---------------------------------------------------------------------------

const previewActive = ref(false)
const previewProgress = ref(0)
let previewRaf = 0
let previewStart = 0

const previewPoint = computed(() => {
  const t = previewProgress.value
  // Evaluate cubic bezier at parameter t
  const cx = 3 * (p1.value.x / 200)
  const bx = 3 * (p2.value.x / 200 - p1.value.x / 200) - cx
  const ax = 1 - cx - bx
  const cy = 3 * ((200 - p1.value.y) / 200)
  const by = 3 * ((200 - p2.value.y) / 200 - (200 - p1.value.y) / 200) - cy
  const ay = 1 - cy - by

  const x = ((ax * t + bx) * t + cx) * t
  const yVal = ((ay * t + by) * t + cy) * t
  return { x: x * 200, y: 200 - yVal * 200 }
})

function togglePreview() {
  if (previewActive.value) {
    cancelAnimationFrame(previewRaf)
    previewRaf = 0
    previewActive.value = false
    previewProgress.value = 0
    return
  }
  previewActive.value = true
  previewStart = performance.now()
  animatePreview()
}

function animatePreview() {
  const elapsed = performance.now() - previewStart
  const duration = 1500
  previewProgress.value = Math.min(1, elapsed / duration)
  if (previewProgress.value < 1) {
    previewRaf = requestAnimationFrame(animatePreview)
  } else {
    // One-shot: stop after one pass
    previewRaf = 0
    previewActive.value = false
    previewProgress.value = 0
  }
}

// ---------------------------------------------------------------------------
// Keyframe property graph
// ---------------------------------------------------------------------------

const selectedKeyframeIndex = ref<number | null>(null)

// Rejection feedback pulse state
const rejectionPulse = ref<{ x: number; y: number; key: number } | null>(null)
let rejectionTimer = 0

function visiblePropertiesForKeyframe(kf: Keyframe): GraphProperty[] {
  return graphProperties.filter(p => p.extract(kf) !== undefined)
}

function getPropertyY(kf: Keyframe, propKey: string): number {
  const prop = graphProperties.find(p => p.key === propKey)
  if (!prop) return 75
  const val = prop.extract(kf)
  if (val === undefined) return 75
  // Normalize to 0-1 range, then map to 150-0 (inverted y)
  const normalized = (val - prop.min) / (prop.max - prop.min)
  return 150 - normalized * 150
}

function getPropertyPoints(propKey: string): string {
  const prop = graphProperties.find(p => p.key === propKey)
  if (!prop) return ''
  const points: string[] = []
  for (const kf of props.keyframes) {
    const val = prop.extract(kf)
    if (val === undefined) continue
    const x = kf.offset * 300
    const y = getPropertyY(kf, propKey)
    points.push(`${x},${y}`)
  }
  return points.join(' ')
}

function selectKeyframe(idx: number) {
  selectedKeyframeIndex.value = selectedKeyframeIndex.value === idx ? null : idx
}

function onGraphClick(event: MouseEvent) {
  if (!graphSvgRef.value) return
  const rect = graphSvgRef.value.getBoundingClientRect()
  const offset = (event.clientX - rect.left) / rect.width
  const clampedOffset = Math.max(0, Math.min(1, +offset.toFixed(2)))

  // Don't add if too close to existing keyframe — show pulse feedback
  const tooClose = props.keyframes.some(kf => Math.abs(kf.offset - clampedOffset) < 0.05)
  if (tooClose) {
    const svgX = clampedOffset * 300
    const svgY = ((event.clientY - rect.top) / rect.height) * 150
    clearTimeout(rejectionTimer)
    rejectionPulse.value = { x: svgX, y: svgY, key: Date.now() }
    rejectionTimer = window.setTimeout(() => {
      rejectionPulse.value = null
    }, 300)
    return
  }

  const newKf: Keyframe = { offset: clampedOffset, opacity: 1 }
  const updated = [...props.keyframes, newKf].sort((a, b) => a.offset - b.offset)
  emit('update:keyframes', updated)
}

function onGraphDelete() {
  if (selectedKeyframeIndex.value === null) return
  const idx = selectedKeyframeIndex.value
  // Don't remove first (offset=0) or last (offset=1) keyframes
  const kf = props.keyframes[idx]
  if (kf.offset === 0 || kf.offset === 1) return

  const updated = props.keyframes.filter((_, i) => i !== idx)
  selectedKeyframeIndex.value = null
  emit('update:keyframes', updated)
}

// ---------------------------------------------------------------------------
// Keyframe point dragging
// ---------------------------------------------------------------------------

let kfDragIndex: number | null = null
let kfDragProp: string | null = null
let kfDragStartKeyframes: Keyframe[] | null = null

function removeKeyframeDragListeners() {
  document.removeEventListener('mousemove', onKeyframeDrag)
  document.removeEventListener('mouseup', onKeyframeDragEnd)
  document.removeEventListener('keydown', onKeyframeDragKeydown)
  document.removeEventListener('contextmenu', onKeyframeDragEnd)
  window.removeEventListener('blur', onKeyframeDragEnd)
}

function startKeyframeDrag(idx: number, propKey: string, event: MouseEvent) {
  kfDragStartKeyframes = [...props.keyframes]
  kfDragIndex = idx
  kfDragProp = propKey
  selectedKeyframeIndex.value = idx
  event.preventDefault()
  document.addEventListener('mousemove', onKeyframeDrag)
  document.addEventListener('mouseup', onKeyframeDragEnd)
  document.addEventListener('keydown', onKeyframeDragKeydown)
  document.addEventListener('contextmenu', onKeyframeDragEnd)
  window.addEventListener('blur', onKeyframeDragEnd)
}

function onKeyframeDrag(event: MouseEvent) {
  if (kfDragIndex === null || kfDragProp === null || !graphSvgRef.value) return
  const prop = graphProperties.find(p => p.key === kfDragProp)
  if (!prop) return

  const rect = graphSvgRef.value.getBoundingClientRect()
  const yRatio = 1 - (event.clientY - rect.top) / rect.height
  const val = prop.min + yRatio * (prop.max - prop.min)
  const clamped = Math.max(prop.min, Math.min(prop.max, +val.toFixed(2)))

  const updated = props.keyframes.map((kf, i) => {
    if (i !== kfDragIndex) return kf
    const copy = { ...kf }
    if (prop.key === 'opacity') {
      copy.opacity = clamped
    } else if (prop.key === 'scale') {
      copy.transform = { ...copy.transform, scale: clamped }
    } else if (prop.key === 'x') {
      copy.transform = { ...copy.transform, x: `${clamped}px` }
    } else if (prop.key === 'y') {
      copy.transform = { ...copy.transform, y: `${clamped}px` }
    } else if (prop.key === 'rotate') {
      copy.transform = { ...copy.transform, rotate: `${clamped}deg` }
    }
    return copy
  })
  emit('update:keyframes', updated)
}

function onKeyframeDragEnd() {
  removeKeyframeDragListeners()
  kfDragIndex = null
  kfDragProp = null
  kfDragStartKeyframes = null
}

function onKeyframeDragKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && kfDragStartKeyframes) {
    // Revert to pre-drag keyframes
    emit('update:keyframes', kfDragStartKeyframes)
    removeKeyframeDragListeners()
    kfDragIndex = null
    kfDragProp = null
    kfDragStartKeyframes = null
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

onBeforeUnmount(() => {
  removeDragListeners()
  removeKeyframeDragListeners()
  cancelAnimationFrame(previewRaf)
  clearTimeout(rejectionTimer)
})
</script>

<style scoped>
.curve-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.curve-editor__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.curve-editor__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--cms-ink-body);
}

.curve-editor__preset {
  margin-bottom: 4px;
}

.curve-editor__svg {
  width: 100%;
  max-width: 200px;
  height: auto;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  background: var(--cms-surface-subtle);
  cursor: crosshair;
}

.curve-editor__grid {
  stroke: var(--cms-line);
  stroke-width: 1;
}

.curve-editor__guide {
  stroke: var(--cms-line);
  stroke-width: 1;
  stroke-dasharray: 4 4;
}

.curve-editor__handle-line {
  stroke: #adb5bd;
  stroke-width: 1;
  stroke-dasharray: 2 2;
}

.curve-editor__curve {
  fill: none;
  stroke: #228be6;
  stroke-width: 2.5;
}

.curve-editor__control-point {
  cursor: grab;
  stroke: var(--cms-surface);
  stroke-width: 2;
}

.curve-editor__control-point--p1 {
  fill: #ff6b6b;
}

.curve-editor__control-point--p2 {
  fill: #51cf66;
}

.curve-editor__control-point:active {
  cursor: grabbing;
}

.curve-editor__preview-dot {
  fill: #228be6;
}

.curve-editor__input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.curve-editor__input-row .form-control {
  flex: 1;
  font-family: monospace;
  font-size: 12px;
}

.curve-editor__property-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.curve-editor__prop-btn {
  font-size: 11px;
  padding: 2px 8px;
}

.curve-editor__graph-svg {
  width: 100%;
  height: auto;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  background: var(--cms-surface-subtle);
  cursor: crosshair;
  outline: none;
}

.curve-editor__axis {
  stroke: #adb5bd;
  stroke-width: 1;
}

.curve-editor__axis-label {
  font-size: 10px;
  fill: #868e96;
}

.curve-editor__keyframe-point {
  cursor: pointer;
}

.curve-editor__keyframe-point:hover {
  r: 7;
}

.curve-editor__rejection-ring {
  pointer-events: none;
  animation: rejection-pulse 300ms ease-out forwards;
}

.curve-editor__rejection-text {
  font-size: 9px;
  fill: #fa5252;
  text-anchor: middle;
  pointer-events: none;
  animation: rejection-fade 300ms ease-out forwards;
}

@keyframes rejection-pulse {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@keyframes rejection-fade {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
</style>
