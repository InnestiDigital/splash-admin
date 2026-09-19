<template>
  <!--
    AdminPageHeader is rendered for non-loaded states (loading / error /
    404 / malformed-template). Loaded structured articles use
    ArticleEditorHeader as their page header — rendering both would emit
    two <h1>s on the page (a11y violation).
  -->
  <AdminPageHeader
    v-if="!data || !data.template"
    :title="t('admin.contentForms.editArticle', 'Edit article')"
    alert-context="articles"
  />

  <!-- Loading -->
  <div v-if="loading" class="text-center py-5">
    <span class="cms-spinner cms-spinner--lg" />
  </div>

  <!-- 404 — article not found -->
  <div v-else-if="notFound" class="text-center py-5">
    <p class="text-muted" style="font-size: 1.5rem;">{{ t('admin.contentForms.articleNotFound', 'Article not found.') }}</p>
    <NuxtLink :to="adminUrl('/articles')" class="cms-btn cms-btn--secondary">
      Back to articles
    </NuxtLink>
  </div>

  <!-- Generic error -->
  <div v-else-if="error" class="cms-alert cms-alert--danger">
    <span class="material-icons-outlined cms-alert-icon">error</span>
    <div class="cms-alert-content">
      <div class="cms-alert-title">{{ t('admin.contentForms.articleLoadFailed', 'Failed to load article') }}</div>
      <div class="cms-alert-description">{{ error }}</div>
    </div>
    <button class="cms-btn cms-btn--secondary cms-btn--sm" @click="fetchArticle">
      Retry
    </button>
  </div>

  <!-- Loaded -->
  <template v-else-if="data">
    <ArticleEditorHeader
      v-if="data.template"
      :article="data.article"
      :parent-title="data.article.parentTitle"
      :editor="editorInstance"
      :preview-open="previewOpen"
      @update:preview-open="(v) => previewOpen = v"
    />
    <div
      v-if="data.template"
      class="article-edit-layout"
      :class="{ 'article-edit-layout--with-preview': previewOpen }"
    >
      <div class="article-edit-layout__main">
        <ArticleEditor
          ref="editorComponent"
          :article="data.article"
          :template="data.template"
          :media="data.media"
        />

        <!--
          Admin-only template switch. The endpoint is admin-only too; this is
          the surface that makes the choice reversible after creation, and the
          one place an author is told which authored fields the target template
          stops rendering.
        -->
        <section v-if="canSwitchTemplate" class="article-template-switch" data-template-switch>
          <h2 class="article-template-switch__title">{{ t('admin.contentForms.template', 'Template') }}</h2>
          <div class="cms-form-group">
            <label for="article-template-select" class="cms-label">
              {{ t('admin.contentForms.template', 'Template') }}
            </label>
            <select
              id="article-template-select"
              v-model="selectedTemplateId"
              class="cms-form-control"
              :disabled="switchingTemplate"
            >
              <option v-for="choice in templateChoices" :key="choice.id" :value="choice.id">
                {{ choice.label }}
              </option>
            </select>
            <div class="cms-form-hint">
              Renders with the <strong>{{ targetLayoutId }}</strong> layout.
            </div>
          </div>

          <div v-if="pendingTemplate" class="cms-alert cms-alert--warning" data-template-switch-confirm>
            <span class="material-icons-outlined cms-alert-icon">swap_horiz</span>
            <div class="cms-alert-content">
              <div class="cms-alert-title">Switch to "{{ pendingTemplate.label }}"?</div>
              <div class="cms-alert-description">
                <p v-if="unrenderedFields.length">
                  This template does not render the following fields. Their content stays saved but
                  stops appearing:
                </p>
                <ul v-if="unrenderedFields.length" class="article-template-switch__dropped">
                  <li v-for="field in unrenderedFields" :key="field.id" data-dropped-field>
                    {{ field.label }}
                  </li>
                </ul>
                <p v-else>All content you have written is rendered by this template too.</p>
                <p>Template settings reset to the new template's defaults.</p>
              </div>
              <div class="article-template-switch__actions">
                <button
                  type="button"
                  class="cms-btn cms-btn--primary cms-btn--sm"
                  :disabled="switchingTemplate"
                  data-confirm-template-switch
                  @click="applyTemplateSwitch"
                >
                  {{ switchingTemplate ? 'Switching...' : 'Switch template' }}
                </button>
                <button
                  type="button"
                  class="cms-btn cms-btn--secondary cms-btn--sm"
                  :disabled="switchingTemplate"
                  @click="cancelTemplateSwitch"
                >
                  {{ t('admin.shared.cancel', 'Cancel') }}
                </button>
              </div>
            </div>
          </div>

          <p v-if="templateSwitchError" class="article-template-switch__error" data-template-switch-error>
            {{ templateSwitchError }}
          </p>
        </section>

        <!--
          Admin-only template settings, mounted next to the content form rather
          than in the page builder. These knobs (show byline, show related
          articles, related heading) are article configuration: the person
          changing them is the person writing the article, and the preview pane
          alongside shows the effect. Editors and viewers never see this —
          `PUT /pages/:id/template-settings` is admin-only too.
        -->
        <TemplateSettingsPanel
          v-if="canShowTemplateSettings && settingsTemplate"
          :page-id="data.article.id"
          :site-id="data.article.siteId"
          :template="settingsTemplate"
          :template-settings="data.article.templateSettings"
          :locale="data.article.locale"
          @update:draft="onTemplateSettingsDraft"
          @saved="onTemplateSettingsSaved"
        />
      </div>
      <ArticlePreviewPane
        v-if="previewOpen"
        :site-id="data.article.siteId"
        :article-id="data.article.id"
        :editor="editorInstance"
        @close="previewOpen = false"
      />
    </div>
    <!-- Should never trigger after Phase Blog-2 rip; structured articles
         must have a valid template. Surface an error instead of falling
         back to legacy block authoring. -->
    <div v-else class="cms-alert cms-alert--danger">
      <span class="material-icons-outlined cms-alert-icon">error</span>
      <div class="cms-alert-content">
        <div class="cms-alert-title">{{ t('admin.contentForms.articleTemplateMissing', 'Article template missing') }}</div>
        <div class="cms-alert-description">
          This article is missing a structured template. Contact an administrator.
        </div>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { getLocalizedLabel } from '~/admin/utils/labelUtils'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import { useSite } from '~/admin/composables/useSite'
import { useSiteApi } from '~/admin/composables/useSiteApi'
import ArticleEditor from '~/admin/components/articleEditor/ArticleEditor.vue'
import ArticleEditorHeader from '~/admin/components/articleEditor/ArticleEditorHeader.vue'
import ArticlePreviewPane from '~/admin/components/articleEditor/ArticlePreviewPane.vue'
import TemplateSettingsPanel from '~/admin/components/pageSettings/TemplateSettingsPanel.vue'
import { useAuthStore } from '~/admin/stores/authStore'
import { unrenderedContentFields } from '~/admin/utils/templateRelation'
import type { TemplateFieldSchema } from '~/shared/types/blog2-content'
import type { MediaRecord } from '~/shared/types/articles'
import type { PageTemplate } from '~/shared/types/templates'
import type { UseArticleEditorReturn } from '~/admin/composables/useArticleEditor'

definePageMeta({ layout: 'admin' })
const { t, locale } = useAdminI18n()

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
  excerpt: Record<string, string> | string | null
  featuredImageId: string | null
  parentId: string | null
  parentTitle: string | null
  pageType: 'article'
  publishedAt: string | null
  updatedAt: string
  /**
   * True when the live public revision (the `articlePublications` snapshot)
   * lags this draft row, i.e. a saved edit is not visible on the public site
   * until a republish. Optional so an older server build degrades to "in sync"
   * rather than nagging.
   */
  hasUnpublishedChanges?: boolean
  authorUserId: string | null
  authorName: string | null
  contentData: Record<string, unknown> | null
  templateSettings: Record<string, unknown> | null
  templateVersion: string | null
  seo: ArticleSeo | null
}

interface Template {
  id: string
  label: string
  appliesTo: 'article' | 'blog-index' | 'static' | null
  layoutId: string
  allowedBlocks: string[]
  component: string | null
  contentSchema: TemplateFieldSchema[]
  settingsSchema: TemplateFieldSchema[]
  version: string | null
  defaultContent: Record<string, unknown>
  defaultSettings: Record<string, unknown>
  defaultSeo: ArticleSeo | null
}

interface ArticleResponse {
  article: Article
  template: Template | null
  media: Record<string, MediaRecord>
}

const route = useRoute()
const { adminUrl } = useAdminUrl()
const { siteId, hasSite } = useSite()
const { siteFetch } = useSiteApi()

const articleId = computed(() => String(route.params.articleId ?? ''))

const data = ref<ArticleResponse | null>(null)
const loading = ref(true)
const error = ref('')
const notFound = ref(false)

// Side-panel preview state. UI-only — the editor composable does not track it.
// Default closed so the editing surface keeps full width on first paint.
const previewOpen = ref(false)

// Template ref to ArticleEditor — exposes `editor` for 2.D.3c's
// ArticleEditorHeader to consume. The editor composable lives inside the
// child so its lifecycle hooks register in the correct setup context.
const editorComponent = ref<{ editor: UseArticleEditorReturn } | null>(null)

// Re-expose the composable instance for the header. On first paint this is
// `null` (the child mounts on the same tick); the header tolerates the gap
// and Vue's reactivity flips it once the child's `defineExpose` resolves.
const editorInstance = computed<UseArticleEditorReturn | null>(() => (
  editorComponent.value?.editor ?? null
))

const authStore = useAuthStore()

/**
 * The article API returns a template shape with nullable fields; `PageTemplate`
 * (what `TemplateSettingsPanel` consumes) uses optionals. Normalise rather than
 * assert so a future API field change fails the build here.
 */
const settingsTemplate = computed<PageTemplate | null>(() => {
  const t = data.value?.template
  if (!t) return null
  return {
    id: t.id,
    label: t.label,
    appliesTo: t.appliesTo ?? 'static',
    layoutId: t.layoutId,
    allowedBlocks: t.allowedBlocks ?? [],
    defaultBlocks: [],
    component: t.component ?? undefined,
    contentSchema: t.contentSchema,
    settingsSchema: t.settingsSchema,
    version: t.version ?? undefined,
    defaultContent: t.defaultContent,
    defaultSettings: t.defaultSettings,
    defaultSeo: t.defaultSeo ?? undefined,
  }
})

/**
 * Admin-only, and only when the template actually declares design knobs.
 * Mirrors the page-builder gate in `SettingsPanel.vue` — defence in depth on
 * top of the admin-only endpoint.
 */
const canShowTemplateSettings = computed(() => {
  if (!authStore.isAdmin) return false
  const schema = data.value?.template?.settingsSchema
  return Array.isArray(schema) && schema.length > 0
})

/**
 * Unsaved settings edit → straight into the preview draft. The preview endpoint
 * takes `templateSettings` as a row override, so the iframe reflects the change
 * before the panel's debounced PUT lands.
 */
function onTemplateSettingsDraft(payload: {
  pageId: string
  templateSettings: Record<string, unknown>
}) {
  // A late emit for a previously-open article must not leak into this one.
  if (!data.value || payload.pageId !== data.value.article.id) return
  const editor = editorInstance.value
  if (editor) editor.draftTemplateSettings.value = payload.templateSettings
}

/** Confirmed server value — refresh both the preview draft and the panel prop. */
function onTemplateSettingsSaved(payload: {
  pageId: string
  templateSettings: Record<string, unknown>
}) {
  if (!data.value || payload.pageId !== data.value.article.id) return
  data.value.article.templateSettings = payload.templateSettings
  onTemplateSettingsDraft(payload)
  // This save went through the template-settings endpoint, not the article PUT,
  // so the composable never saw a write. Tell it, or the header keeps claiming
  // the public revision is current while it still holds the old settings.
  editorInstance.value?.markUnpublishedChanges()
}

/**
 * Article templates the site's theme declares, for the switcher. Only the id,
 * label, layout and contentSchema matter here — the rest of the template shape
 * is the server's business.
 */
interface TemplateChoice {
  id: string
  label: string
  layoutId: string
  contentSchema: TemplateFieldSchema[]
}

const templateChoices = ref<TemplateChoice[]>([])
const selectedTemplateId = ref('')
const switchingTemplate = ref(false)
const templateSwitchError = ref('')

const canSwitchTemplate = computed(() => (
  authStore.isAdmin && !!data.value?.template && templateChoices.value.length > 1
))

/** The chosen template while it differs from the saved one — i.e. awaiting confirmation. */
const pendingTemplate = computed<TemplateChoice | null>(() => {
  const currentId = data.value?.template?.id
  const chosenId = selectedTemplateId.value
  if (!chosenId || chosenId === currentId) return null
  return templateChoices.value.find(choice => choice.id === chosenId) ?? null
})

/** Layout the currently selected template renders with. */
const targetLayoutId = computed(() => (
  pendingTemplate.value?.layoutId
  ?? data.value?.template?.layoutId
  ?? 'default'
))

/** Authored fields the target template would stop rendering. */
const unrenderedFields = computed(() => {
  const target = pendingTemplate.value
  const article = data.value?.article
  if (!target || !article) return []
  return unrenderedContentFields({
    currentSchema: data.value?.template?.contentSchema,
    targetSchema: target.contentSchema,
    contentData: article.contentData,
    locale: article.locale,
  })
})

async function fetchTemplateChoices() {
  if (!hasSite.value || !authStore.isAdmin) return
  try {
    const res = await siteFetch<{ theme: { templates?: unknown } }>('/schemas')
    const raw = Array.isArray(res.theme?.templates) ? res.theme.templates : []
    templateChoices.value = raw
      .filter((tpl: any) => tpl && typeof tpl.id === 'string' && tpl.appliesTo === 'article')
      .map((tpl: any) => ({
        id: tpl.id,
        label: getLocalizedLabel(tpl.label, locale?.value) || tpl.id,
        layoutId: typeof tpl.layoutId === 'string' ? tpl.layoutId : 'default',
        contentSchema: Array.isArray(tpl.contentSchema) ? tpl.contentSchema : [],
      }))
  } catch (e: any) {
    templateChoices.value = []
    templateSwitchError.value = e?.data?.statusMessage || e?.statusMessage || 'Failed to load templates'
  }
}

function cancelTemplateSwitch() {
  selectedTemplateId.value = data.value?.template?.id ?? ''
  templateSwitchError.value = ''
}

async function applyTemplateSwitch() {
  const target = pendingTemplate.value
  const article = data.value?.article
  if (!target || !article) return
  switchingTemplate.value = true
  templateSwitchError.value = ''
  try {
    await siteFetch(`/articles/${article.id}/template`, {
      method: 'PUT',
      body: { templateId: target.id },
    })
    await fetchArticle()
  } catch (e: any) {
    selectedTemplateId.value = data.value?.template?.id ?? ''
    templateSwitchError.value = e?.data?.statusMessage || e?.statusMessage || 'Failed to switch template'
  } finally {
    switchingTemplate.value = false
  }
}

async function fetchArticle() {
  if (!hasSite.value || !articleId.value) return
  loading.value = true
  error.value = ''
  notFound.value = false
  try {
    const res = await siteFetch<ArticleResponse>(`/articles/${articleId.value}`)
    data.value = res
    selectedTemplateId.value = res.template?.id ?? ''
  } catch (e: any) {
    if (e?.statusCode === 404 || e?.response?.status === 404) {
      notFound.value = true
    } else {
      error.value = e?.data?.statusMessage || e?.statusMessage || 'Failed to load article'
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (hasSite.value) {
    fetchArticle()
    fetchTemplateChoices()
  }
})

watch(siteId, (id) => {
  if (id) {
    fetchArticle()
    fetchTemplateChoices()
  }
})

watch(articleId, (id) => {
  if (id) fetchArticle()
})
</script>

<style scoped>
.text-center {
  text-align: center;
}
.py-5 {
  padding-top: 3rem;
  padding-bottom: 3rem;
}
.text-muted {
  color: var(--cms-ink-subtle);
}

/* Side-panel preview layout. Single column when collapsed, 60/40 split when
   open on wide viewports. Below 1100px the preview stacks under the editor so
   neither panel is squeezed. */
.article-edit-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.6rem;
  align-items: start;
}

/* Editing column: content form stacked over the admin template settings. */
.article-edit-layout__main {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  min-width: 0;
}

@media (min-width: 1100px) {
  .article-edit-layout--with-preview {
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  }
}

.article-template-switch {
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius-card);
  padding: 1.6rem;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.article-template-switch__title {
  font-size: 1.6rem;
  margin: 0;
}

.article-template-switch__dropped {
  margin: 0.4rem 0 0.8rem;
  padding-left: 1.8rem;
}

.article-template-switch__actions {
  display: flex;
  gap: 0.8rem;
  margin-top: 0.8rem;
}

.article-template-switch__error {
  color: var(--cms-danger);
  margin: 0;
}

</style>
