<template>
  <section
    class="ui-async"
    :class="`ui-async--${type}`"
    :role="type === 'error' ? 'alert' : 'status'"
    :aria-live="type === 'error' ? 'assertive' : 'polite'"
  >
    <template v-if="type === 'loading'">
      <span class="ui-async__spinner" aria-hidden="true" />
      <div>
        <h2>{{ title || 'Loading' }}</h2>
        <p>{{ description || 'Getting everything ready…' }}</p>
      </div>
    </template>
    <template v-else>
      <span class="material-icons-outlined ui-async__icon" aria-hidden="true">error_outline</span>
      <div>
        <h2>{{ title || 'Something went wrong' }}</h2>
        <p>{{ description }}</p>
      </div>
      <button v-if="retryable" type="button" class="cms-btn cms-btn--secondary cms-btn--sm" @click="$emit('retry')">
        Try again
      </button>
    </template>
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  type: 'loading' | 'error'
  title?: string
  description?: string
  retryable?: boolean
}>(), { retryable: true })

defineEmits<{ retry: [] }>()
</script>

<style scoped>
.ui-async {
  display: flex;
  min-height: 14rem;
  align-items: center;
  justify-content: center;
  gap: var(--cms-sp-4);
  padding: var(--cms-sp-6);
  color: var(--cms-ink-muted);
  border: 1px solid var(--cms-line);
  border-radius: var(--cms-radius-card);
  background: var(--cms-surface);
}

.ui-async h2 { margin: 0; color: var(--cms-ink); font-size: var(--cms-fs-lg); }
.ui-async p { max-width: 52ch; margin: 0.35rem 0 0; color: var(--cms-ink-muted); font-size: var(--cms-fs-sm); }
.ui-async__icon { color: var(--cms-danger); font-size: 2.4rem; }
.ui-async__spinner {
  width: 2.4rem;
  height: 2.4rem;
  border: 2px solid var(--cms-line);
  border-top-color: var(--cms-accent);
  border-radius: 50%;
  animation: ui-async-spin 0.55s linear infinite;
}

@keyframes ui-async-spin { to { transform: rotate(360deg); } }

@media (max-width: 600px) {
  .ui-async { align-items: flex-start; flex-wrap: wrap; justify-content: flex-start; min-height: 11rem; }
}
</style>
