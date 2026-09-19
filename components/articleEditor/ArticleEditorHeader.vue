<template>
  <header class="article-editor-header" data-component="article-editor-header">
    <div class="article-editor-header__left">
      <NuxtLink
        :to="adminUrl('/articles')"
        class="article-editor-header__back"
      >
        <span class="material-icons-outlined" aria-hidden="true">arrow_back</span>
        <span>Articles</span>
      </NuxtLink>
      <div class="article-editor-header__title">
        <h1>{{ resolvedTitle }}</h1>
        <p class="article-editor-header__meta">
          <span class="article-editor-header__parent">
            {{ parentLabel }}
          </span>
          <span class="article-editor-header__separator" aria-hidden="true">·</span>
          <StatusPill :status="status" />
          <!-- Articles render publicly from an immutable publication snapshot,
               so "Published" on its own is misleading the moment anything is
               saved. Say so, next to the pill that would otherwise imply the
               live page is current. -->
          <span
            v-if="showRepublish"
            class="article-editor-header__stale"
            data-state="unpublished-changes"
            role="status"
          >
            <span class="material-icons-outlined" aria-hidden="true">sync_problem</span>
            Unpublished changes
          </span>
        </p>
      </div>
    </div>

    <div class="article-editor-header__right">
      <span
        v-if="saveIndicator"
        class="article-editor-header__save-indicator"
        :class="`article-editor-header__save-indicator--${saveIndicatorTone}`"
        :data-state="editor?.saveState.value ?? 'idle'"
        role="status"
        aria-live="polite"
      >
        <span
          v-if="saveIndicatorIcon"
          class="material-icons-outlined article-editor-header__save-icon"
          aria-hidden="true"
        >{{ saveIndicatorIcon }}</span>
        {{ saveIndicator }}
      </span>

      <button
        type="button"
        class="cms-btn cms-btn--secondary cms-btn--sm"
        :class="{ 'cms-btn--active': previewOpen }"
        :aria-pressed="previewOpen ? 'true' : 'false'"
        data-action="toggle-preview"
        @click="onTogglePreview"
      >
        <span class="material-icons-outlined" aria-hidden="true">visibility</span>
        Preview
      </button>

      <button
        v-if="!isPublished"
        type="button"
        class="cms-btn cms-btn--primary cms-btn--sm"
        :disabled="!canPublish"
        data-action="publish"
        @click="onPublish"
      >
        <span v-if="isPublishing" class="cms-btn-spinner" />
        {{ publishButtonLabel }}
      </button>
      <!-- Republish. A published article's only control used to be Unpublish, so
           pushing a saved edit live required unpublish-then-publish. Same
           endpoint as Publish: `publishArticle` re-upserts the publication row
           from the current draft and preserves the original `publishedAt`. -->
      <button
        v-if="isPublished && showRepublish"
        type="button"
        class="cms-btn cms-btn--primary cms-btn--sm"
        :disabled="!canPublish"
        data-action="republish"
        @click="onPublish"
      >
        <span v-if="isPublishing" class="cms-btn-spinner" />
        {{ republishButtonLabel }}
      </button>
      <button
        v-if="isPublished"
        type="button"
        class="cms-btn cms-btn--secondary cms-btn--sm"
        :disabled="!canUnpublish"
        data-action="unpublish"
        @click="onUnpublish"
      >
        <span v-if="isUnpublishing" class="cms-btn-spinner" />
        {{ unpublishButtonLabel }}
      </button>
    </div>

    <p
      v-if="publishError"
      class="article-editor-header__publish-error"
      role="alert"
    >{{ publishError }}</p>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import StatusPill from '~/admin/components/pageSettings/StatusPill.vue'
import type { UseArticleEditorReturn } from '~/admin/composables/useArticleEditor'

interface ArticleHeaderProps {
  id: string
  slug: string
  locale: string
  title: Record<string, string> | string
  publishedAt?: string | null
}

interface Props {
  /** Source-of-truth article record from GET. Used for slug + publishedAt fallback. */
  article: ArticleHeaderProps
  /** Parent blog title (null when no blog parent or load not yet resolved). */
  parentTitle: string | null
  /**
   * The composable instance from `useArticleEditor`. Possibly null when the
   * page passes a template-ref that hasn't resolved yet — header tolerates
   * the gap and renders with article-only fallbacks until it lands.
   */
  editor: UseArticleEditorReturn | null
  /**
   * State of the side-panel preview pane. The page owns the ref; the header
   * exposes a toggle button via `update:previewOpen`. UI-only state; the
   * editor composable doesn't track it.
   */
  previewOpen?: boolean
}

const props = withDefaults(defineProps<Props>(), { previewOpen: false })
const emit = defineEmits<{
  (e: 'update:previewOpen', value: boolean): void
}>()

const { adminUrl } = useAdminUrl()

function onTogglePreview() {
  emit('update:previewOpen', !props.previewOpen)
}

// Title resolution — prefer the live draft (the user may have edited the
// title field), otherwise fall back to the persisted article title.
//
// `??` only short-circuits null/undefined, so an empty-string locale entry
// (e.g. `map['en-US'] === ''`) would render an empty header. We coerce
// missing-or-empty to falsy so the fallback chain reaches a usable value.
const resolvedTitle = computed(() => {
  const draft = props.editor?.draftTitle.value
  const fallback = props.article.title
  const candidate = draft ?? fallback
  if (typeof candidate === 'string') return candidate.trim() || 'Untitled article'
  if (candidate && typeof candidate === 'object') {
    const locale = props.article.locale ?? 'en-US'
    const map = candidate as Record<string, string>
    const direct = (map[locale] || '').trim()
    if (direct) return direct
    const enFallback = (map['en-US'] || '').trim()
    if (enFallback) return enFallback
    const anyValue = Object.values(map).find(v => typeof v === 'string' && v.trim())
    return anyValue || 'Untitled article'
  }
  return 'Untitled article'
})

const parentLabel = computed(() => props.parentTitle ?? 'No blog')

// The header should reflect the SERVER's view of publication state. Publish /
// unpublish actions reset the composable's `publishState` to `'published'` /
// `'unpublished'`, but the canonical source after a refetch is `article.publishedAt`.
// We treat the header as "published" when EITHER the server says so OR the
// composable just succeeded — the page will refetch on a future nav and
// reconcile the article record.
const isPublished = computed(() => {
  if (props.article.publishedAt) {
    return props.editor?.publishState.value !== 'unpublished'
  }
  return props.editor?.publishState.value === 'published'
})

const status = computed<'draft' | 'published'>(() => (
  isPublished.value ? 'published' : 'draft'
))

// ── Save indicator ─────────────────────────────────────────────────────────

/**
 * Render a relative-time string for "Saved Xs ago".
 *
 * `formatRelativeDate` (utils/formatters) takes ISO strings and clips at "1m
 * ago" (no second-level resolution). For the header indicator we want
 * "just now" / "5s ago" feel, so we roll a small inline helper rather than
 * generalize the util — keeps formatters.ts pure for date-input callsites.
 */
function formatSavedAgo(d: Date): string {
  const diffMs = Date.now() - d.getTime()
  const seconds = Math.max(0, Math.floor(diffMs / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return d.toLocaleString()
}

const saveIndicator = computed<string>(() => {
  if (!props.editor) return ''
  const state = props.editor.saveState.value
  if (state === 'saving') return 'Saving…'
  if (state === 'error') {
    const err = props.editor.saveError.value
    return err ? `Save failed: ${err}` : 'Save failed'
  }
  if (state === 'saved') {
    const at = props.editor.lastSavedAt.value
    return at ? `Saved ${formatSavedAgo(at)}` : 'Saved'
  }
  if (props.editor.isDirty.value) return 'Unsaved changes'
  return ''
})

const saveIndicatorTone = computed<'neutral' | 'progress' | 'success' | 'error'>(() => {
  if (!props.editor) return 'neutral'
  const state = props.editor.saveState.value
  if (state === 'saving') return 'progress'
  if (state === 'error') return 'error'
  if (state === 'saved') return 'success'
  return 'neutral'
})

const saveIndicatorIcon = computed<string | null>(() => {
  if (!props.editor) return null
  const state = props.editor.saveState.value
  if (state === 'saving') return 'sync'
  if (state === 'error') return 'error_outline'
  if (state === 'saved') return 'check_circle'
  return null
})

// ── Publish / unpublish ────────────────────────────────────────────────────

const isPublishing = computed(() => props.editor?.publishState.value === 'publishing')
const isUnpublishing = computed(() => props.editor?.publishState.value === 'unpublishing')

// `canPublish` from the composable already checks "not saving / not publishing".
// We additionally require the editor surface to be present.
const canPublish = computed(() => Boolean(props.editor?.canPublish.value))
const canUnpublish = computed(() => (
  Boolean(props.editor) && !isUnpublishing.value && !isPublishing.value
))

/**
 * Show the republish call-to-action only when the public revision actually
 * lags. The composable seeds this from the server at load and keeps it current
 * (set on every successful write, cleared on publish/unpublish), so it survives
 * a reload — a session-only flag would forget about yesterday's unpublished
 * edit. Absent composable → assume in sync rather than nag.
 */
const showRepublish = computed(() => (
  isPublished.value && Boolean(props.editor?.hasUnpublishedChanges.value)
))

const publishButtonLabel = computed(() => (isPublishing.value ? 'Publishing…' : 'Publish'))
const republishButtonLabel = computed(() => (isPublishing.value ? 'Publishing…' : 'Republish'))
const unpublishButtonLabel = computed(() => (isUnpublishing.value ? 'Unpublishing…' : 'Unpublish'))

const publishError = computed<string | null>(() => props.editor?.publishError.value ?? null)

async function onPublish() {
  if (!props.editor || !canPublish.value) return
  await props.editor.publish()
}

async function onUnpublish() {
  if (!props.editor || !canUnpublish.value) return
  await props.editor.unpublish()
}

// ── Preview toggle ─────────────────────────────────────────────────────────
//
// Replaces the V3-deferred public-URL Preview button. Toggles the side-panel
// realtime preview iframe (`ArticlePreviewPane`). State lives on the parent
// page (UI-only), forwarded via `update:previewOpen`.
</script>

<style scoped>
.article-editor-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.6rem;
  flex-wrap: wrap;
  background: var(--cms-surface);
  border: 1px solid var(--cms-line);
  border-radius: 0.4rem;
  padding: 1.6rem 2rem;
  margin-bottom: 1.6rem;
}

.article-editor-header__left {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  flex: 1;
  min-width: 0;
}

.article-editor-header__back {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 1.2rem;
  color: var(--cms-ink-muted);
  text-decoration: none;
}
.article-editor-header__back:hover {
  text-decoration: underline;
  color: var(--cms-ink-body);
}
.article-editor-header__back .material-icons-outlined {
  font-size: 1.6rem;
}

.article-editor-header__title h1 {
  font-size: 2rem;
  margin: 0;
  line-height: 1.3;
  word-break: break-word;
}

.article-editor-header__meta {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0.4rem 0 0;
  font-size: 1.2rem;
  color: var(--cms-ink-muted);
  flex-wrap: wrap;
}

.article-editor-header__parent {
  font-weight: 500;
}

.article-editor-header__separator {
  color: #b5b8bb;
}

/* Warning tone, not error: the draft is safe, only the public copy is behind. */
.article-editor-header__stale {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 1.1rem;
  font-weight: 600;
  color: #9a6700;
}

.article-editor-header__stale .material-icons-outlined {
  font-size: 1.4rem;
}

.article-editor-header__right {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.article-editor-header__save-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 1.2rem;
  color: var(--cms-ink-muted);
  white-space: nowrap;
}

.article-editor-header__save-indicator--success {
  color: #137333;
}
.article-editor-header__save-indicator--error {
  color: #c5221f;
}
.article-editor-header__save-indicator--progress {
  color: var(--cms-accent);
}

.article-editor-header__save-icon {
  font-size: 1.4rem;
}

.article-editor-header__save-indicator--progress .article-editor-header__save-icon {
  animation: article-editor-header-spin 1s linear infinite;
}

@keyframes article-editor-header-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.article-editor-header__publish-error {
  flex-basis: 100%;
  margin: 0;
  color: #c5221f;
  font-size: 1.2rem;
}

/* Active state for the Preview toggle button. The design system doesn't ship
   a `cms-btn--active` modifier — we add a scoped one here so other surfaces
   aren't affected. Stays inside this scoped block (no :deep needed) because
   the button is rendered directly in this component's template. */
.cms-btn--active {
  background: var(--cms-accent-soft);
  color: var(--cms-accent);
  border-color: var(--cms-accent);
}
</style>
