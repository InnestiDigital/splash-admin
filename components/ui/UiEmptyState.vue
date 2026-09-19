<template>
  <div class="ui-empty" :class="`ui-empty--${size}`">
    <span v-if="icon" class="material-icons-outlined ui-empty__icon" aria-hidden="true">{{ icon }}</span>
    <p class="ui-empty__title">{{ title }}</p>
    <p v-if="description" class="ui-empty__description">{{ description }}</p>
    <div v-if="$slots.action" class="ui-empty__action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The "nothing here yet" state. Replaces ten-plus bespoke versions, each with
 * its own padding, muted colour and phrasing (I8).
 *
 * Copy contract: `title` states the situation in the user's terms ("No articles
 * yet"), `description` says what to do about it. An empty state that only says
 * "No results" without a next step is the thing this component exists to stop.
 */
withDefaults(defineProps<{
  title: string
  description?: string
  /** Material Icons Outlined name. */
  icon?: string
  /** `inline` for inside a panel or list; `page` for a full content area. */
  size?: 'inline' | 'page'
}>(), {
  size: 'inline',
})
</script>

<style lang="scss" scoped>
.ui-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--cms-ink-muted);
}

.ui-empty--inline {
  gap: var(--cms-sp-2);
  padding: var(--cms-sp-5) var(--cms-sp-4);
}

.ui-empty--page {
  gap: var(--cms-sp-3);
  padding: var(--cms-sp-8) var(--cms-sp-5);
  background: var(--cms-surface);
  border: 1px dashed var(--cms-line-strong);
  border-radius: var(--cms-radius-card);
}

.ui-empty__icon {
  color: var(--cms-ink-subtle);

  .ui-empty--inline & { font-size: 2.4rem; }
  .ui-empty--page & { font-size: 4rem; }
}

.ui-empty__title {
  margin: 0;
  font-weight: 600;
  color: var(--cms-ink-body);

  .ui-empty--inline & { font-size: var(--cms-fs-sm); }
  .ui-empty--page & { font-size: var(--cms-fs-lg); }
}

.ui-empty__description {
  margin: 0;
  max-width: 44ch;
  font-size: var(--cms-fs-sm);
}

.ui-empty__action {
  margin-top: var(--cms-sp-2);
}
</style>
