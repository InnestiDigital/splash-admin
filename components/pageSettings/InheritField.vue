<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** Override key this control writes, used as the row's `data-field`. */
  field: string
  label: string
  /** Human-readable value the page inherits when nothing is overridden. */
  inherited: string
  /** True while no explicit value is stored for this key. */
  inheriting: boolean
  disabled?: boolean
  hint?: string
}>()

const emit = defineEmits<{ inherit: [] }>()

const status = computed(() =>
  props.inheriting
    ? `Inherited from the layout: ${props.inherited}`
    : `Set on this page. The layout says ${props.inherited}.`,
)
</script>

<template>
  <div
    class="cms-form-group inherit-field"
    :data-field="field"
    :data-inheriting="inheriting ? 'true' : 'false'"
  >
    <div class="inherit-field__head">
      <label class="cms-label">{{ label }}</label>
      <button
        v-if="!inheriting"
        type="button"
        class="inherit-field__reset"
        data-action="inherit"
        :disabled="disabled"
        @click="emit('inherit')"
      >
        Inherit
      </button>
    </div>
    <slot />
    <p class="inherit-field__status" data-role="inherit-status">{{ status }}</p>
    <p v-if="hint" class="inherit-field__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.inherit-field__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.8rem;
}
.inherit-field__reset {
  border: 0;
  background: none;
  padding: 0;
  font-size: 1.1rem;
  color: var(--cms-accent, var(--cms-ink-muted));
  cursor: pointer;
}
.inherit-field__reset:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.inherit-field__status,
.inherit-field__hint {
  margin: 0.4rem 0 0;
  font-size: 1.1rem;
  color: var(--cms-ink-muted);
}
.inherit-field[data-inheriting="false"] .inherit-field__status {
  color: var(--cms-ink-subtle);
}
</style>
