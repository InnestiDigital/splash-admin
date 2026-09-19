<script setup lang="ts">
import { ref, computed } from 'vue'

export interface VisualOption {
  value: string
  label: string
  icon?: string        // inline SVG string
  swatch?: string      // CSS color value
  description?: string
}

const props = withDefaults(defineProps<{
  options: VisualOption[]
  modelValue: string
  compact?: boolean
  mode?: 'card' | 'swatch' | 'bar'
  ariaLabel?: string
  disabled?: boolean
}>(), {
  compact: false,
  mode: 'card',
  ariaLabel: 'Options',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const optionRefs = ref<(HTMLElement | null)[]>([])

const setOptionRef = (el: any, index: number) => {
  optionRefs.value[index] = el
}

// Bar mode widths — relative visual indicators
const barWidths: Record<string, string> = {
  content: '51%',
  measure: '86%',
  wide: '100%',
  'full-bleed': '100%',
}

function getBarWidth(value: string): string {
  return barWidths[value] || '80%'
}

function selectOption(value: string) {
  if (props.disabled) return
  emit('update:modelValue', value)
}

// Whether a swatch color is light (needs border to be visible)
function isLightSwatch(color: string): boolean {
  if (!color) return false
  const lower = color.toLowerCase()
  return lower === '#ffffff' || lower === '#fff' || lower === 'white'
}

function handleKeydown(event: KeyboardEvent) {
  if (props.disabled) return
  const opts = props.options
  if (opts.length === 0) return

  const currentIndex = opts.findIndex(opt => opt.value === props.modelValue)
  let newIndex = currentIndex

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      event.preventDefault()
      newIndex = (currentIndex + 1) % opts.length
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      event.preventDefault()
      newIndex = (currentIndex - 1 + opts.length) % opts.length
      break
    case 'Home':
      event.preventDefault()
      newIndex = 0
      break
    case 'End':
      event.preventDefault()
      newIndex = opts.length - 1
      break
    default:
      return
  }

  if (newIndex !== currentIndex) {
    const option = opts[newIndex]
    if (!option) return
    selectOption(option.value)
    optionRefs.value[newIndex]?.focus()
  }
}
</script>

<template>
  <div
    class="visual-option-group"
    :class="[
      `visual-option-group--${mode}`,
      { 'visual-option-group--compact': compact },
    ]"
    role="radiogroup"
    :aria-label="ariaLabel"
    :aria-disabled="disabled"
    @keydown="handleKeydown"
  >
    <!-- Card mode -->
    <template v-if="mode === 'card'">
      <button
        v-for="(option, index) in options"
        :key="option.value"
        :ref="(el: any) => setOptionRef(el, index)"
        type="button"
        role="radio"
        :disabled="disabled"
        :aria-checked="modelValue === option.value"
        :tabindex="modelValue === option.value ? 0 : -1"
        :class="['visual-option-group__card', { 'is-selected': modelValue === option.value }]"
        @click="selectOption(option.value)"
      >
        <div class="visual-option-group__icon">
          <span v-if="option.icon" v-html="option.icon" />
          <span v-else class="visual-option-group__placeholder">
            {{ option.label?.charAt(0)?.toUpperCase() }}
          </span>
        </div>
        <span class="visual-option-group__copy">
          <span class="visual-option-group__label">{{ option.label }}</span>
          <span v-if="option.description" class="visual-option-group__description">
            {{ option.description }}
          </span>
        </span>
      </button>
    </template>

    <!-- Swatch mode -->
    <template v-else-if="mode === 'swatch'">
      <button
        v-for="(option, index) in options"
        :key="option.value"
        :ref="(el: any) => setOptionRef(el, index)"
        type="button"
        role="radio"
        :disabled="disabled"
        :aria-checked="modelValue === option.value"
        :tabindex="modelValue === option.value ? 0 : -1"
        :class="['visual-option-group__swatch-item', { 'is-selected': modelValue === option.value }]"
        @click="selectOption(option.value)"
      >
        <span
          class="visual-option-group__swatch"
          :class="{ 'visual-option-group__swatch--light': isLightSwatch(option.swatch || '') }"
          :style="{ background: option.swatch || '#ccc' }"
        />
        <span class="visual-option-group__label">{{ option.label }}</span>
      </button>
    </template>

    <!-- Bar mode -->
    <template v-else-if="mode === 'bar'">
      <button
        v-for="(option, index) in options"
        :key="option.value"
        :ref="(el: any) => setOptionRef(el, index)"
        type="button"
        role="radio"
        :disabled="disabled"
        :aria-checked="modelValue === option.value"
        :tabindex="modelValue === option.value ? 0 : -1"
        :class="['visual-option-group__bar-item', { 'is-selected': modelValue === option.value }]"
        @click="selectOption(option.value)"
      >
        <div class="visual-option-group__bar-track">
          <div
            class="visual-option-group__bar-fill"
            :class="{ 'visual-option-group__bar-fill--bleed': option.value === 'full-bleed' }"
            :style="{ width: getBarWidth(option.value) }"
          />
        </div>
        <span class="visual-option-group__label">{{ option.label }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.visual-option-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cms-sp-3, 12px);
}

.visual-option-group--compact { gap: var(--cms-sp-2, 8px); }

/* ── Bar mode: vertical stack ── */
.visual-option-group--bar { flex-direction: column; gap: 6px; }
.visual-option-group--bar.visual-option-group--compact { gap: 4px; }

/* ════════════════════════════
   Card mode
   ════════════════════════════ */
.visual-option-group__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1 1 0;
  gap: 8px;
  min-width: 80px;
  min-height: 80px;
  padding: var(--cms-sp-3, 12px);
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: 8px;
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: var(--cms-surface);
  font: inherit;
  cursor: pointer;
  transition:
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    box-shadow var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.visual-option-group--compact .visual-option-group__card {
  padding: 8px;
  min-width: 64px;
  gap: 6px;
}

.visual-option-group__card.is-selected {
  border-color: var(--cms-accent, var(--cms-accent));
  color: var(--cms-accent-pressed, var(--cms-accent-pressed));
  background: var(--cms-accent-softest, var(--cms-accent-softest));
  box-shadow: 0 0 0 2px var(--cms-accent-ring, rgba(46, 125, 50, 0.2));
}

.visual-option-group__card:active { transform: scale(0.98); }

.visual-option-group__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.visual-option-group__description {
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-caption, 12px);
  font-weight: 400;
  line-height: 1.4;
}

.visual-option-group__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
}

.visual-option-group--compact .visual-option-group__icon {
  width: 40px;
  height: 40px;
}

.visual-option-group__icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.visual-option-group__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 4px;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  font-size: 20px;
  font-weight: 600;
}

/* ════════════════════════════
   Swatch mode
   ════════════════════════════ */
.visual-option-group__swatch-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1 1 0;
  gap: 6px;
  min-width: 56px;
  padding: var(--cms-sp-2, 8px);
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: var(--cms-surface);
  font: inherit;
  cursor: pointer;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    box-shadow var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.visual-option-group--compact .visual-option-group__swatch-item {
  padding: 6px;
  min-width: 48px;
  gap: 4px;
}

.visual-option-group__swatch-item.is-selected {
  border-color: var(--cms-accent, var(--cms-accent));
  background: var(--cms-accent-softest, var(--cms-accent-softest));
  box-shadow: 0 0 0 2px var(--cms-accent-ring, rgba(46, 125, 50, 0.2));
}

.visual-option-group__swatch-item:active { transform: scale(0.97); }

.visual-option-group__swatch {
  display: block;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
}

.visual-option-group__swatch--light {
  box-shadow: inset 0 0 0 1px var(--cms-line-strong, var(--cms-line-strong));
}

/* ════════════════════════════
   Bar mode
   ════════════════════════════ */
.visual-option-group__bar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: 6px;
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: var(--cms-surface);
  font: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    box-shadow var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.visual-option-group--compact .visual-option-group__bar-item {
  padding: 6px 8px;
  gap: 8px;
}

.visual-option-group__bar-item.is-selected {
  border-color: var(--cms-accent, var(--cms-accent));
  background: var(--cms-accent-softest, var(--cms-accent-softest));
  box-shadow: 0 0 0 2px var(--cms-accent-ring, rgba(46, 125, 50, 0.2));
}

.visual-option-group__bar-item:active { transform: scale(0.99); }

.visual-option-group__bar-track {
  flex: 0 0 60px;
  height: 8px;
  background: var(--cms-surface-sunken, var(--cms-surface-sunken));
  border-radius: 4px;
  overflow: hidden;
}

.visual-option-group__bar-fill {
  height: 100%;
  background: var(--cms-line-hover, var(--cms-line-hover));
  border-radius: 4px;
  transition: width var(--cms-motion-normal, 180ms) var(--cms-ease-out, ease-out);
}

.visual-option-group__bar-fill--bleed {
  background: var(--cms-ink-subtle, var(--cms-ink-subtle));
  border-radius: 0;
}

.visual-option-group__bar-item.is-selected .visual-option-group__bar-fill {
  background: var(--cms-accent, var(--cms-accent));
}

.visual-option-group__bar-item.is-selected .visual-option-group__bar-fill--bleed {
  background: var(--cms-accent-pressed, var(--cms-accent-pressed));
}

/* ════════════════════════════
   Shared label
   ════════════════════════════ */
.visual-option-group__label {
  overflow: hidden;
  color: inherit;
  font-size: var(--cms-fs-caption, 12px);
  font-weight: 600;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visual-option-group__card.is-selected .visual-option-group__label,
.visual-option-group__swatch-item.is-selected .visual-option-group__label,
.visual-option-group__bar-item.is-selected .visual-option-group__label {
  color: var(--cms-accent-pressed, var(--cms-accent-pressed));
  font-weight: 700;
}

.visual-option-group__card:focus-visible,
.visual-option-group__swatch-item:focus-visible,
.visual-option-group__bar-item:focus-visible {
  outline: 2px solid var(--cms-accent, var(--cms-accent));
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .visual-option-group__card:not(.is-selected):hover,
  .visual-option-group__bar-item:not(.is-selected):hover {
    border-color: var(--cms-line-hover, var(--cms-line-hover));
    background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  }

  .visual-option-group__swatch-item:not(.is-selected):hover {
    background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  }
}
</style>
