<template>
  <div class="bgs">
    <p v-if="error" class="bgs__error" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="bgs__empty">{{ t('admin.brand.gallery.loading', 'Loading past generations…') }}</p>
    <p v-else-if="rows.length === 0" class="bgs__empty">{{ emptyCopy }}</p>
    <ul v-else class="bgs__strip">
      <li v-for="row in rows" :key="row.id" class="bgs__item">
        <img
          v-if="row.url"
          class="bgs__thumb"
          :src="row.url"
          :alt="row.filename ?? t('admin.brand.gallery.savedGeneration', 'Saved generation')"
          loading="lazy"
        >
        <div v-else class="bgs__thumb bgs__thumb--gone">
          {{ t('admin.brand.gallery.imageDeleted', 'Image deleted — recipe kept') }}
        </div>
        <div class="bgs__meta">
          <slot name="badge" :row="row" />
        </div>
        <time class="bgs__when" :datetime="row.createdAt">{{ formatWhen(row.createdAt) }}</time>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts" generic="T extends BrandGenerationStripRow">
import { formatWhen } from '~/admin/utils/formatters'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

const { t } = useAdminI18n()

/**
 * The one shape every generation-history row needs so this strip can paint a
 * thumbnail and a timestamp. Callers may (and do) carry more on `T` — a
 * template row's version pin and its flattened staleness state — and the
 * `#badge` slot receives the whole row, so a caller's own markup can reach
 * past this minimum without the strip knowing about it.
 */
export interface BrandGenerationStripRow {
  id: string
  url: string | null
  filename: string | null
  createdAt: string
}

defineProps<{
  rows: T[]
  loading: boolean
  error: string | null
  /** Shown when the scope has no saved generations yet — phrased per caller. */
  emptyCopy: string
}>()

defineSlots<{
  /** A version pin, a re-open button — whatever this row's caller wants said about it. */
  badge(props: { row: T }): unknown
}>()
</script>

<style scoped>
.bgs__error {
  margin: 0;
  color: var(--cms-danger, var(--cms-danger));
  font-size: var(--cms-fs-sm, 13px);
}

.bgs__empty {
  margin: 0;
  padding: var(--cms-sp-4, 16px);
  border: 1px dashed var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-card, 10px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  font-size: var(--cms-fs-sm, 13px);
  line-height: 1.5;
}

.bgs__strip {
  display: flex;
  gap: var(--cms-sp-3, 12px);
  overflow-x: auto;
  list-style: none;
  margin: 0;
  padding: 0 0 var(--cms-sp-2, 8px);
  scroll-snap-type: x proximity;
  scrollbar-color: var(--cms-line-strong, var(--cms-line-strong)) transparent;
}

.bgs__item {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 6px;
  width: 168px;
  padding: var(--cms-sp-2, 8px);
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface);
  scroll-snap-align: start;
}

.bgs__thumb {
  display: block;
  width: 150px;
  height: 88px;
  object-fit: contain;
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: 6px;
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}

.bgs__thumb--gone {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--cms-sp-2, 8px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: 11px;
  line-height: 1.35;
  text-align: center;
}

.bgs__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cms-sp-1, 4px);
}

.bgs__when {
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
</style>
