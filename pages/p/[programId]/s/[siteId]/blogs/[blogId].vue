<template>
  <!--
    AdminPageHeader is rendered for non-loaded states (loading / error /
    404 / malformed-template). Loaded structured blogs use BlogEditorHeader
    (a thin clone of ArticleEditorHeader) — rendering both would emit two
    <h1>s on the page (a11y violation).
  -->
  <AdminPageHeader
    v-if="!data || !data.template"
    :title="t('admin.contentForms.editBlog', 'Edit blog')"
    alert-context="blogs"
  />

  <!-- Loading -->
  <div v-if="loading" class="text-center py-5">
    <span class="cms-spinner cms-spinner--lg" />
  </div>

  <!-- 404 — blog not found -->
  <div v-else-if="notFound" class="text-center py-5">
    <p class="text-muted" style="font-size: 1.5rem;">{{ t('admin.contentForms.blogNotFound', 'Blog not found.') }}</p>
    <NuxtLink :to="adminUrl('/blogs')" class="cms-btn cms-btn--secondary">
      Back to blogs
    </NuxtLink>
  </div>

  <!-- Generic error -->
  <div v-else-if="error" class="cms-alert cms-alert--danger">
    <span class="material-icons-outlined cms-alert-icon">error</span>
    <div class="cms-alert-content">
      <div class="cms-alert-title">{{ t('admin.contentForms.blogLoadFailed', 'Failed to load blog') }}</div>
      <div class="cms-alert-description">{{ error }}</div>
    </div>
    <button class="cms-btn cms-btn--secondary cms-btn--sm" @click="fetchBlog">
      Retry
    </button>
  </div>

  <!-- Loaded -->
  <template v-else-if="data && data.template">
    <header class="blog-edit__header">
      <div class="blog-edit__header-left">
        <NuxtLink
          :to="adminUrl('/blogs')"
          class="blog-edit__back"
        >
          <span class="material-icons-outlined" aria-hidden="true">arrow_back</span>
          <span>{{ t('admin.nav.blogs', 'Blogs') }}</span>
        </NuxtLink>
        <div class="blog-edit__title">
          <h1>{{ resolvedTitle }}</h1>
          <p class="blog-edit__meta">
            <code>/{{ data.blog.slug }}</code>
            <span class="blog-edit__separator" aria-hidden="true">·</span>
            <StatusPill :status="data.blog.publishedAt ? 'published' : 'draft'" />
          </p>
        </div>
      </div>
    </header>

    <!-- Tab strip — Content + SEO only for V2.
         Articles + Settings tabs deferred (see comment block at script foot). -->
    <div class="blog-edit__tabs" role="tablist">
      <button
        type="button"
        class="blog-edit__tab"
        :class="{ 'blog-edit__tab--active': tab === 'content' }"
        role="tab"
        :aria-selected="tab === 'content'"
        @click="tab = 'content'"
      >
        Content
      </button>
      <button
        type="button"
        class="blog-edit__tab"
        :class="{ 'blog-edit__tab--active': tab === 'seo' }"
        role="tab"
        :aria-selected="tab === 'seo'"
        @click="tab = 'seo'"
      >
        SEO
      </button>
    </div>

    <section v-if="tab === 'content'" role="tabpanel">
      <ArticleEditor
        :article="data.blog"
        :template="data.template"
        :media="data.media"
        kind="blogs"
      />
    </section>

    <section v-else-if="tab === 'seo'" role="tabpanel" class="blog-edit__seo-pane">
      <p class="text-muted" style="font-size: 1.3rem;">
        SEO fields for this blog. Changes save with the rest of the blog content.
      </p>
      <!-- V2 ships SEO as a thin direct-bind form. Reusing ArticleEditor's
           surface here would conflate canonical content vs SEO state. The
           editor already accepts seo updates via PUT; this panel just edits
           a local copy and triggers the same saves. -->
      <p class="cms-alert cms-alert--info" style="font-size: 1.3rem;">
        SEO editing is read-only in V2. Use the Pages admin or theme editor
        for full SEO + template-settings authoring (admin role only).
      </p>
      <dl class="blog-edit__seo-readout">
        <div>
          <dt>{{ t('admin.contentForms.metaTitle', 'Meta title') }}</dt>
          <dd>{{ pickLocalized(data.blog.seo?.metaTitle) || '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('admin.contentForms.metaDescription', 'Meta description') }}</dt>
          <dd>{{ pickLocalized(data.blog.seo?.metaDescription) || '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('admin.contentForms.indexInSearch', 'Index in search') }}</dt>
          <dd>{{ data.blog.seo?.noIndex ? 'No' : 'Yes' }}</dd>
        </div>
      </dl>
    </section>
  </template>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import { useSite } from '~/admin/composables/useSite'
import { useSiteApi } from '~/admin/composables/useSiteApi'
import ArticleEditor from '~/admin/components/articleEditor/ArticleEditor.vue'
import StatusPill from '~/admin/components/pageSettings/StatusPill.vue'
import type { TemplateFieldSchema } from '~/shared/types/blog2-content'
import type { MediaRecord } from '~/shared/types/articles'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

interface BlogSeo {
  metaTitle?: Record<string, string> | null
  metaDescription?: Record<string, string> | null
  ogImageId?: string | null
  noIndex?: boolean
}

interface Blog {
  id: string
  siteId: string
  slug: string
  locale: string
  title: Record<string, string> | string
  excerpt: Record<string, string> | string | null
  featuredImageId: string | null
  parentId: string | null
  pageType: 'blog-index'
  publishedAt: string | null
  updatedAt: string
  authorUserId: string | null
  authorName: string | null
  contentData: Record<string, unknown> | null
  templateSettings: Record<string, unknown> | null
  templateVersion: string | null
  seo: BlogSeo | null
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
  defaultSeo: BlogSeo | null
}

interface BlogResponse {
  blog: Blog
  template: Template | null
  media: Record<string, MediaRecord>
}

const route = useRoute()
const { adminUrl } = useAdminUrl()
const { siteId, hasSite } = useSite()
const { siteFetch } = useSiteApi()

const blogId = computed(() => String(route.params.blogId ?? ''))

const data = ref<BlogResponse | null>(null)
const loading = ref(true)
const error = ref('')
const notFound = ref(false)

const tab = ref<'content' | 'seo'>('content')

function pickLocalized(map: any): string {
  if (!map) return ''
  if (typeof map === 'string') return map
  return map['en-US'] || map['en-CA'] || Object.values(map)[0] || ''
}

const resolvedTitle = computed(() => {
  if (!data.value) return 'Edit blog'
  const t = pickLocalized(data.value.blog.title)
  return t || 'Untitled blog'
})

async function fetchBlog() {
  if (!hasSite.value || !blogId.value) return
  loading.value = true
  error.value = ''
  notFound.value = false
  try {
    const res = await siteFetch<BlogResponse>(`/blogs/${blogId.value}`)
    data.value = res
  } catch (e: any) {
    if (e?.statusCode === 404 || e?.response?.status === 404) {
      notFound.value = true
    } else {
      error.value = e?.data?.statusMessage || e?.statusMessage || 'Failed to load blog'
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (hasSite.value) fetchBlog()
})

watch(siteId, (id) => {
  if (id) fetchBlog()
})

watch(blogId, (id) => {
  if (id) fetchBlog()
})

// V2 deferral notes:
// - "Articles" tab (embedded article list under this blog) — punt to V3.
//   The /admin/.../articles list already has a `blog` filter; users can
//   navigate there with the parent blog pre-selected.
// - "Settings" tab (template switch + parent re-link) — admin-only, lives in
//   the Theme Editor's Template Settings panel (chunk 2.F, separate task).
//   For now an admin who needs to switch templates uses the generic Pages
//   admin (PUT /pages/:id/template — admin-only).
// - SEO editing is read-only in this V2 surface. Full SEO authoring lives in
//   the Pages admin and the theme editor's template-settings panel (2.F).
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

.blog-edit__header {
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

.blog-edit__header-left {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  flex: 1;
  min-width: 0;
}

.blog-edit__back {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 1.2rem;
  color: var(--cms-ink-muted);
  text-decoration: none;
}
.blog-edit__back:hover {
  text-decoration: underline;
  color: var(--cms-ink-body);
}
.blog-edit__back .material-icons-outlined {
  font-size: 1.6rem;
}

.blog-edit__title h1 {
  font-size: 2rem;
  margin: 0;
  line-height: 1.3;
  word-break: break-word;
}

.blog-edit__meta {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0.4rem 0 0;
  font-size: 1.2rem;
  color: var(--cms-ink-muted);
  flex-wrap: wrap;
}
.blog-edit__meta code {
  background: var(--cms-surface-subtle);
  padding: 0.1rem 0.4rem;
  border-radius: 0.2rem;
}

.blog-edit__separator {
  color: #b5b8bb;
}

.blog-edit__tabs {
  display: flex;
  gap: 0.4rem;
  border-bottom: 1px solid var(--cms-line);
  margin-bottom: 1.6rem;
}
.blog-edit__tab {
  padding: 1rem 1.4rem;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--cms-ink-subtle);
  cursor: pointer;
  font-size: 1.3rem;
}
.blog-edit__tab:hover {
  color: var(--cms-ink-body);
}
.blog-edit__tab--active {
  color: var(--cms-accent);
  border-bottom-color: var(--cms-accent);
  font-weight: 500;
}

.blog-edit__seo-pane {
  background: var(--cms-surface);
  border: 1px solid var(--cms-line);
  border-radius: 0.4rem;
  padding: 2rem;
}

.blog-edit__seo-readout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.2rem;
  margin: 1.5rem 0 0;
}
.blog-edit__seo-readout > div {
  display: grid;
  grid-template-columns: 16rem minmax(0, 1fr);
  gap: 1.2rem;
  align-items: start;
}
.blog-edit__seo-readout dt {
  font-size: 1.2rem;
  color: var(--cms-ink-subtle);
  margin: 0;
}
.blog-edit__seo-readout dd {
  font-size: 1.3rem;
  color: var(--cms-ink-body);
  margin: 0;
  word-break: break-word;
}
</style>
