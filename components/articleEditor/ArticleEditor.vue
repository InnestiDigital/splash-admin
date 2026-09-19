<template>
  <div class="article-editor">
    <FormRenderer
      :schema="orderedFields"
      :model-value="content"
      @update:model-value="onContentUpdate"
    />

    <!-- field-level validation errors (server-returned), surfaced at the bottom
         since FormRenderer + child field components don't know about them. -->
    <div v-if="hasValidationErrors" class="article-editor__errors">
      <p
        v-for="entry in flatErrors"
        :key="entry.key"
        class="article-editor__error"
        :class="{ 'article-editor__error--form': entry.fieldId === '_form' }"
        role="alert"
      >
        <strong v-if="entry.fieldId !== '_form'">{{ entry.fieldId }}:</strong>
        {{ entry.msg }}
      </p>
    </div>

    <div class="article-editor__actions">
      <span class="article-editor__status">{{ statusLabel }}</span>
      <button
        type="button"
        class="cms-btn cms-btn--primary"
        :disabled="saveDisabled"
        @click="onSaveClick"
      >
        {{ saveButtonLabel }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, provide, ref, toRef, type Ref } from 'vue'
import type { TemplateFieldSchema } from '~/shared/types/blog2-content'
import type { MediaRecord } from '~/shared/types/articles'
import { useArticleEditor } from '~/admin/composables/useArticleEditor'
import FormRenderer from '~/admin/components/fields/FormRenderer.vue'
import { useTypographyStore } from '~/admin/stores/typographyStore'
import { useAdminTypographyStyles } from '~/admin/composables/useAdminTypographyStyles'

interface ArticleSeo {
  metaTitle?: Record<string, string> | null
  metaDescription?: Record<string, string> | null
  ogImageId?: string | null
  noIndex?: boolean
}

interface Article {
  id: string
  siteId: string
  slug: string
  locale: string
  title: Record<string, string> | string
  excerpt?: Record<string, string> | string | null
  featuredImageId?: string | null
  parentId?: string | null
  parentTitle?: string | null
  pageType: 'article'
  publishedAt?: string | null
  updatedAt: string
  /** Live public revision lags this draft — seeds the header's republish CTA. */
  hasUnpublishedChanges?: boolean
  authorUserId?: string | null
  contentData: Record<string, unknown> | null
  templateSettings?: Record<string, unknown> | null
  templateVersion?: string | null
  seo?: ArticleSeo | null
}

interface Template {
  id: string
  label: string
  component: string | null
  appliesTo: 'article' | 'blog-index' | 'static' | null
  contentSchema: TemplateFieldSchema[]
  settingsSchema: TemplateFieldSchema[]
  version: string | null
  defaultContent?: Record<string, unknown>
  defaultSettings?: Record<string, unknown>
  defaultSeo?: ArticleSeo | null
}

interface Props {
  article: Article
  template: Template
  media: Record<string, MediaRecord>
  /**
   * Resource kind passed through to `useArticleEditor`. Defaults to `'articles'`.
   * Pass `'blogs'` when reusing this editor for the blog-index edit surface;
   * the composable rewrites its endpoint URLs accordingly.
   */
  kind?: 'articles' | 'blogs'
}

const props = withDefaults(defineProps<Props>(), { kind: 'articles' })

// Editing locale: prefer injected ref (a future LocaleSwitcher will provide it),
// else fall back to the article's stored locale, then 'en-US'.
const injectedLocale = inject<Ref<string> | null>('editingLocale', null)
const activeLocale = computed(() => (
  injectedLocale?.value ?? props.article.locale ?? 'en-US'
))

// Provide for descendant fields (TRichTextEditor, TImagePicker, TImageGallery,
// DynamicField). They inject 'editingLocale' to unwrap locale-keyed values.
provide('editingLocale', activeLocale)

// TImagePicker uses this to talk to /api/admin/s/<siteId>/media/*.
provide('siteId', computed(() => props.article.siteId))

// Article contentData stores media IDs (per Blog-2 spec). The picker honors
// this default unless a field-level override is set in the schema.
provide('imageValueMode', ref<'id' | 'url'>('id'))

// Typography presets feed the rich-text toolbar's "Typography Preset" dropdown.
// Without these, the dropdown stays empty even though the toolbar shows.
const typographyStore = useTypographyStore()
provide('typographyPresets', computed(() => typographyStore.typographyPresets))
onMounted(() => {
  if (typographyStore.typographyPresets.length === 0) {
    typographyStore.fetchTypographyPresets()
  }
  if (Object.keys(typographyStore.typographyRoles).length === 0) {
    typographyStore.fetchTypographyRoles()
  }
})

// Inject `<style>` block with `.rt-preset-{key}` classes + CSS vars so
// presets actually render their typography inside the TipTap editor surface.
// Mirrors how the page-builder editor (editor.vue) does it.
useAdminTypographyStyles()

// Instantiate the editor composable. Must happen in setup so its onBeforeUnmount
// + watch hooks register correctly. We pass `toRef`s onto the props so the
// composable's article-identity watcher fires when the page swaps articles
// without unmounting (e.g. route nav between sibling articles).
//
// V2 simplicity: no `onSaved` callback to refetch the page. The composable IS
// the source of truth for the editing session — refetching on every save would
// unmount this component (page template uses v-if=loading) and destroy
// in-progress drafts. The article body cache is purged by the PUT endpoint
// itself (see purgeArticleBodyCache); list pages refetch summaries on nav.
const editor = useArticleEditor({
  siteId: computed(() => props.article.siteId),
  articleId: computed(() => props.article.id),
  article: toRef(props, 'article') as any,
  kind: props.kind,
})

// Bind to composable's draft contentData. FormRenderer pushes a new map on
// every field update; we replace the whole record to keep reactivity correct.
const content = computed<Record<string, any>>(() => (
  (editor.draftContentData.value as Record<string, any>) ?? {}
))

function onContentUpdate(next: Record<string, any>) {
  editor.draftContentData.value = next
}

/** Sort: title-role first, then schema order. */
const orderedFields = computed<TemplateFieldSchema[]>(() => {
  const fields = props.template.contentSchema ?? []
  return [...fields].sort((a, b) => {
    const aRole = a.role === 'title' ? 0 : 1
    const bRole = b.role === 'title' ? 0 : 1
    if (aRole !== bRole) return aRole - bRole
    return 0
  })
})

const flatErrors = computed(() => {
  const out: Array<{ key: string; fieldId: string; msg: string }> = []
  for (const [fieldId, msgs] of Object.entries(editor.validationErrors.value)) {
    for (const msg of msgs) {
      out.push({ key: `${fieldId}::${msg}`, fieldId, msg })
    }
  }
  return out
})

const hasValidationErrors = computed(() => flatErrors.value.length > 0)

// ── Save button presentation ─────────────────────────────────────────────────

const saveDisabled = computed(() => (
  editor.saveState.value === 'saving'
  || (!editor.isDirty.value && editor.saveState.value !== 'error')
))

const saveButtonLabel = computed(() => {
  switch (editor.saveState.value) {
    case 'saving': return 'Saving…'
    case 'saved': return 'Saved'
    case 'error': return 'Retry save'
    default: return 'Save'
  }
})

const statusLabel = computed(() => {
  if (editor.saveState.value === 'saving') return 'Saving…'
  if (editor.saveState.value === 'error' && editor.saveError.value) {
    return `Save failed: ${editor.saveError.value}`
  }
  if (editor.saveState.value === 'saved') return 'All changes saved'
  if (editor.isDirty.value) return 'Unsaved changes'
  return ''
})

async function onSaveClick() {
  await editor.save()
}

// Expose the editor so the page (and 2.D.3c's ArticleEditorHeader, mounted as
// a sibling) can read save/publish state.
defineExpose({ editor })
</script>

<style scoped>
.article-editor {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  background: var(--cms-surface);
  border: 1px solid var(--cms-line);
  border-radius: 0.4rem;
  padding: 2rem;
}

.article-editor__field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.article-editor__required {
  color: #d93025;
  margin-left: 0.2rem;
}

.article-editor__help {
  font-size: 1.2rem;
  color: var(--cms-ink-muted);
  margin: 0;
}

.article-editor__rich {
  min-height: 12rem;
  font-family: monospace;
  font-size: 1.2rem;
}

.article-editor__image {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.article-editor__image-preview {
  max-width: 24rem;
  max-height: 18rem;
  object-fit: cover;
  border-radius: 0.3rem;
  background: var(--cms-surface-subtle);
}

.article-editor__image-empty {
  padding: 1.2rem;
  text-align: center;
  color: var(--cms-ink-subtle);
  border: 1px dashed var(--cms-line);
  border-radius: 0.3rem;
  font-size: 1.2rem;
}

.article-editor__check {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.article-editor__unsupported {
  padding: 0.6rem 0.9rem;
  background: #fff8e1;
  color: #6c5c00;
  border-radius: 0.3rem;
  font-size: 1.2rem;
}

.article-editor__error {
  margin: 0;
  color: #d93025;
  font-size: 1.2rem;
}

.article-editor__error--form {
  font-weight: 600;
}

.article-editor__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
  border-top: 1px solid var(--cms-line);
  padding-top: 1.5rem;
}

.article-editor__status {
  font-size: 1.2rem;
  color: var(--cms-ink-muted);
}
</style>
