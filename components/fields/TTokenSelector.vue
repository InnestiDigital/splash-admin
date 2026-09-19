<!-- admin/components/fields/TTokenSelector.vue -->
<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface TokenValue {
  mode: 'token'
  value: string
}

interface CustomValue {
  mode: 'custom'
  value: number
  unit: string
}

type ModelValue = TokenValue | CustomValue | undefined

const props = withDefaults(defineProps<{
  modelValue?: ModelValue
  tokens: readonly string[]
  label?: string
  allowCustom?: boolean
  customMin?: number
  customMax?: number
  customStep?: number
  customUnit?: string
  disabled?: boolean
}>(), {
  allowCustom: false,
  customMin: 0,
  customMax: 200,
  customStep: 1,
  customUnit: 'px',
})

const emit = defineEmits<{
  'update:modelValue': [value: ModelValue]
}>()

const localMode = ref<'token' | 'custom'>(props.modelValue?.mode ?? 'token')

const isCustomMode = computed(() => localMode.value === 'custom')

const activeToken = computed(() =>
  localMode.value === 'token' && props.modelValue?.mode === 'token' ? props.modelValue.value : null
)

const customValue = ref(
  props.modelValue?.mode === 'custom' ? props.modelValue.value : props.customMin
)

watch(() => props.modelValue, (val) => {
  if (val?.mode) localMode.value = val.mode
})

function selectToken(token: string) {
  emit('update:modelValue', { mode: 'token', value: token })
}

function toggleCustom() {
  if (isCustomMode.value) {
    const firstToken = props.tokens[0]
    if (!firstToken) return
    localMode.value = 'token'
    emit('update:modelValue', { mode: 'token', value: firstToken })
  } else {
    localMode.value = 'custom'
    emit('update:modelValue', { mode: 'custom', value: customValue.value, unit: props.customUnit })
  }
}

function onCustomChange(event: Event) {
  const val = Number((event.target as HTMLInputElement).value)
  customValue.value = val
  emit('update:modelValue', { mode: 'custom', value: val, unit: props.customUnit })
}
</script>

<template>
  <div class="token-selector">
    <label v-if="label" class="token-selector__label">{{ label }}</label>

    <div v-if="!isCustomMode" class="token-selector__tokens">
      <button
        v-for="token in tokens"
        :key="token"
        type="button"
        :data-token="token"
        :disabled="disabled"
        class="token-selector__btn"
        :class="{ 'token-selector__btn--active': activeToken === token }"
        @click="selectToken(token)"
      >
        {{ token }}
      </button>
      <button
        v-if="allowCustom"
        type="button"
        data-custom-toggle
        :disabled="disabled"
        class="token-selector__btn token-selector__btn--custom"
        @click="toggleCustom"
      >
        &#x22EF;
      </button>
    </div>

    <div v-else class="token-selector__custom">
      <input
        type="number"
        :min="customMin"
        :max="customMax"
        :step="customStep"
        :value="customValue"
        :disabled="disabled"
        class="token-selector__input"
        @change="onCustomChange"
      />
      <span class="token-selector__unit">{{ customUnit }}</span>
      <button
        type="button"
        data-custom-toggle
        :disabled="disabled"
        class="token-selector__btn token-selector__btn--reset"
        title="Back to tokens"
        @click="toggleCustom"
      >
        &#x21A9;
      </button>
    </div>
  </div>
</template>

<style scoped>
.token-selector__label {
  display: block;
  margin: 0 0 var(--cms-sp-2, 8px);
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-sm, 13px);
  font-weight: 600;
  line-height: 1.35;
}

.token-selector__tokens {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cms-sp-1, 4px);
}

.token-selector__btn {
  min-height: var(--cms-density-xs, 28px);
  padding: 0 10px;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  font-family: inherit;
  font-size: var(--cms-fs-overline, 11px);
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
  transition:
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    box-shadow var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .token-selector__btn:not(.token-selector__btn--active):not(:disabled):hover {
    border-color: var(--cms-line-hover, var(--cms-line-hover));
    color: var(--cms-ink, var(--cms-ink));
    background: var(--cms-surface-sunken, var(--cms-surface-sunken));
  }
}

.token-selector__btn:focus-visible,
.token-selector__input:focus-visible {
  outline: 2px solid var(--cms-accent, var(--cms-accent));
  outline-offset: 2px;
}

.token-selector__btn:active:not(:disabled) {
  transform: scale(0.97);
}

.token-selector__btn:disabled,
.token-selector__input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.token-selector__btn--active {
  border-color: var(--cms-accent, var(--cms-accent));
  color: var(--cms-accent-pressed, var(--cms-accent-pressed));
  background: var(--cms-accent-softest, var(--cms-accent-softest));
  box-shadow: 0 0 0 2px var(--cms-accent-ring, rgba(46, 125, 50, 0.2));
}

.token-selector__btn--custom {
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  border-style: dashed;
}

.token-selector__custom {
  display: flex;
  align-items: center;
  gap: var(--cms-sp-2, 8px);
}

.token-selector__input {
  width: 80px;
  min-height: var(--cms-density-sm, 34px);
  padding: 0 var(--cms-sp-2, 8px);
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: var(--cms-surface);
  font-family: inherit;
  font-size: var(--cms-fs-sm, 13px);
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    box-shadow var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.token-selector__unit {
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-overline, 11px);
  font-weight: 600;
}

.token-selector__btn--reset {
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-body, 14px);
}
</style>
