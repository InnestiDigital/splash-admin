<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
/**
 * Visual indicator for page/article publish state.
 *
 * Used in two places (Blog-1, Chunk D.4):
 *   - admin page list (replaces the status select for articles, not for static/blog-index)
 *   - ArticleSettingsPanel header (next to the publish/unpublish button)
 */
defineProps<{ status: 'draft' | 'published' }>()
const { t } = useAdminI18n()
</script>

<template>
  <span
    class="status-pill"
    :class="`status-pill--${status}`"
    data-component="status-pill"
  >
    {{ status === 'published' ? t('admin.pages.published', 'Published') : t('admin.pages.draft', 'Draft') }}
  </span>
</template>

<style scoped>
.status-pill {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 0.5rem;
  font-size: 1.1rem;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}
.status-pill--published {
  background: var(--cms-accent-soft);
  color: var(--cms-accent-pressed);
}
.status-pill--draft {
  background: var(--cms-surface-sunken);
  color: var(--cms-ink-muted);
}
</style>
