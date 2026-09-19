<template>
  <AdminPageHeader :title="t('admin.nav.newArticle', 'New article')" alert-context="articles" />

  <div class="article-new__card">
    <!-- Stepper ------------------------------------------------------- -->
    <div class="article-new__stepper">
      <button
        v-for="(label, idx) in STEP_LABELS"
        :key="idx"
        type="button"
        class="article-new__step"
        :class="{
          'article-new__step--active': step === idx + 1,
          'article-new__step--complete': step > idx + 1,
        }"
        :disabled="!canJumpToStep(idx + 1)"
        @click="canJumpToStep(idx + 1) && (step = (idx + 1) as 1 | 2 | 3)"
      >
        <span class="article-new__step-num">{{ idx + 1 }}</span>
        <span class="article-new__step-label">{{ label }}</span>
      </button>
    </div>

    <!-- Step 1: Pick blog --------------------------------------------- -->
    <section v-if="step === 1" class="article-new__step-pane">
      <h3 class="article-new__heading">{{ t('admin.contentForms.chooseBlog', 'Choose a blog') }}</h3>

      <div v-if="loadingBlogs" class="text-center py-3">
        <span class="cms-spinner cms-spinner--md" />
      </div>

      <div v-else-if="blogsError" class="cms-alert cms-alert--danger">
        <span class="material-icons-outlined cms-alert-icon">error</span>
        <div class="cms-alert-content">
          <div class="cms-alert-title">{{ t('admin.contentForms.blogsFailed', 'Failed to load blogs') }}</div>
          <div class="cms-alert-description">{{ blogsError }}</div>
        </div>
        <button class="cms-btn cms-btn--secondary cms-btn--sm" @click="fetchBlogs">
          {{ t('admin.shell.retry', 'Retry') }}
        </button>
      </div>

      <div v-else-if="blogs.length === 0" class="article-new__empty">
        <p class="text-muted" style="font-size: 1.5rem;">{{ t('admin.contentForms.noBlogs', 'No blogs found.') }}</p>
        <p class="text-muted" style="font-size: 1.3rem;">
          {{ t('admin.contentForms.createBlogFirst', 'Create a blog first.') }}
        </p>
        <NuxtLink :to="adminUrl('/pages')" class="cms-btn cms-btn--secondary">
          {{ t('admin.contentForms.managePages', 'Manage pages') }}
        </NuxtLink>
      </div>

      <div v-else class="cms-form-group">
        <label class="cms-label">Blog</label>
        <select
          v-model="form.blogId"
          class="cms-form-control"
          style="max-width: 32rem;"
        >
          <option value="">— {{ t('admin.contentForms.selectBlog', 'Select a blog') }} —</option>
          <option v-for="b in blogs" :key="b.id" :value="b.id">
            {{ b.title }}
          </option>
        </select>
      </div>
    </section>

    <!-- Step 2: Pick template ----------------------------------------- -->
    <section v-else-if="step === 2" class="article-new__step-pane">
      <h3 class="article-new__heading">{{ t('admin.contentForms.chooseTemplate', 'Choose a template') }}</h3>

      <div v-if="loadingTemplates" class="text-center py-3">
        <span class="cms-spinner cms-spinner--md" />
      </div>

      <div v-else-if="templatesError" class="cms-alert cms-alert--danger">
        <span class="material-icons-outlined cms-alert-icon">error</span>
        <div class="cms-alert-content">
          <div class="cms-alert-title">{{ t('admin.contentForms.templatesFailed', 'Failed to load templates') }}</div>
          <div class="cms-alert-description">{{ templatesError }}</div>
        </div>
        <button class="cms-btn cms-btn--secondary cms-btn--sm" @click="fetchTemplates">
          {{ t('admin.shell.retry', 'Retry') }}
        </button>
      </div>

      <div v-else-if="articleTemplates.length === 0" class="article-new__empty">
        <p class="text-muted" style="font-size: 1.5rem;">
          {{ t('admin.contentForms.noArticleTemplates', 'This theme has no article templates.') }}
        </p>
        <p class="text-muted" style="font-size: 1.3rem;">
          Add a template with <code>appliesTo: "article"</code> to the theme manifest.
        </p>
      </div>

      <div v-else class="article-new__templates">
        <button
          v-for="t in articleTemplates"
          :key="t.id"
          type="button"
          class="article-new__template-card"
          :class="{ 'article-new__template-card--active': form.templateId === t.id }"
          @click="form.templateId = t.id"
        >
          <TemplateSketch class="article-new__template-sketch" :template-id="t.id" />
          <div class="article-new__template-label">{{ t.label }}</div>
          <code class="article-new__template-id">{{ t.id }}</code>
        </button>
      </div>
    </section>

    <!-- Step 3: Title ------------------------------------------------- -->
    <section v-else-if="step === 3" class="article-new__step-pane">
      <h3 class="article-new__heading">{{ t('admin.contentForms.title', 'Title') }}</h3>

      <div class="cms-form-group">
        <label class="cms-label" for="article-title">{{ t('admin.contentForms.articleTitle', 'Article title') }}</label>
        <input
          id="article-title"
          v-model.trim="form.title"
          type="text"
          class="cms-form-control"
          placeholder="e.g. Why Splash uses static-first config"
          maxlength="200"
          autocomplete="off"
          @keydown.enter.prevent="submit()"
        />
        <div v-if="slugPreview" class="article-new__slug-preview">
          {{ t('admin.contentForms.url', 'URL') }}: <code>/{{ selectedBlogSlug }}/{{ slugPreview }}</code>
        </div>
      </div>

      <div v-if="submitError" class="cms-alert cms-alert--danger">
        <span class="material-icons-outlined cms-alert-icon">error</span>
        <div class="cms-alert-content">
          <div class="cms-alert-title">{{ t('admin.contentForms.createArticleFailed', 'Failed to create article') }}</div>
          <div class="cms-alert-description">{{ submitError }}</div>
        </div>
      </div>
    </section>

    <!-- Footer actions ------------------------------------------------ -->
    <div class="article-new__actions">
      <button
        type="button"
        class="cms-btn cms-btn--secondary"
        @click="cancel()"
      >
        {{ t('admin.shared.cancel', 'Cancel') }}
      </button>
      <div class="article-new__actions-right">
        <button
          v-if="step > 1"
          type="button"
          class="cms-btn cms-btn--secondary"
          @click="step = (step - 1) as 1 | 2 | 3"
        >
          {{ t('common.back', 'Back') }}
        </button>
        <button
          v-if="step < 3"
          type="button"
          class="cms-btn cms-btn--primary"
          :disabled="!canAdvance"
          @click="step = (step + 1) as 1 | 2 | 3"
        >
          {{ t('admin.shared.continue', 'Continue') }}
        </button>
        <button
          v-else
          type="button"
          class="cms-btn cms-btn--primary"
          :disabled="!canSubmit"
          @click="submit()"
        >
          <span v-if="submitting" class="cms-spinner cms-spinner--sm" style="margin-right: 0.5rem;" />
          {{ t('admin.contentForms.createArticle', 'Create article') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import { useSite } from '~/admin/composables/useSite'
import { useSiteApi } from '~/admin/composables/useSiteApi'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { getLocalizedLabel } from '~/admin/utils/labelUtils'
import TemplateSketch from '~/admin/components/template-picker/TemplateSketch.vue'
import { useAssistantPrefillStore } from '~/admin/stores/assistantPrefillStore'
import { applyArticlesNewPrefill } from '~/admin/utils/prefill/adapters/articlesNew'

definePageMeta({ layout: 'admin' })
const { t, locale } = useAdminI18n()

// ─── Step labels ────────────────────────────────────────────────────────────
const STEP_LABELS = computed(() => [
  t('admin.contentForms.blogStep', 'Blog'),
  t('admin.contentForms.templateStep', 'Template'),
  t('admin.contentForms.detailsStep', 'Details'),
] as const)

// ─── Composables ────────────────────────────────────────────────────────────
const { adminUrl } = useAdminUrl()
const { siteId, hasSite } = useSite()
const { siteFetch } = useSiteApi()

// ─── State ──────────────────────────────────────────────────────────────────
const step = ref<1 | 2 | 3>(1)

interface BlogOption {
  id: string
  title: string
  slug: string
}

interface TemplateOption {
  id: string
  label: string
  appliesTo: string
  layoutId: string
}

const blogs = ref<BlogOption[]>([])
const loadingBlogs = ref(false)
const blogsError = ref('')

const allTemplates = ref<TemplateOption[]>([])
const loadingTemplates = ref(false)
const templatesError = ref('')
const templatesLoaded = ref(false)

const form = ref({
  blogId: '',
  templateId: '',
  title: '',
})

const submitting = ref(false)
const submitError = ref('')

// ─── Derived ────────────────────────────────────────────────────────────────
const articleTemplates = computed(() =>
  allTemplates.value.filter(t => t.appliesTo === 'article'),
)

const selectedBlogSlug = computed(() => {
  const b = blogs.value.find(x => x.id === form.value.blogId)
  return b?.slug ?? '…'
})

/** Live client-side slug preview. Server still owns canonical generation. */
const slugPreview = computed(() => {
  if (!form.value.title) return ''
  return form.value.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
})

const canAdvance = computed(() => {
  if (step.value === 1) return !!form.value.blogId
  if (step.value === 2) return !!form.value.templateId
  return false
})

const canSubmit = computed(() =>
  !submitting.value
  && !!form.value.blogId
  && !!form.value.templateId
  && form.value.title.trim().length > 0,
)

function canJumpToStep(target: 1 | 2 | 3): boolean {
  // Forward jumps require all previous steps to be valid.
  if (target === 1) return true
  if (target === 2) return !!form.value.blogId
  if (target === 3) return !!form.value.blogId && !!form.value.templateId
  return false
}

// ─── Fetchers ───────────────────────────────────────────────────────────────
/**
 * Derive blog options from the article list endpoint (same trick the list
 * page uses). 2.E.1 will replace this with a dedicated /blogs endpoint that
 * returns blogs with zero articles too.
 *
 * For now we hit /articles, dedupe by parentId, and surface the parent title.
 * If a site has zero articles we'll see zero blogs — call out the gap so the
 * editor knows where to go.
 */
async function fetchBlogs() {
  if (!hasSite.value) return
  loadingBlogs.value = true
  blogsError.value = ''
  try {
    // Single source of truth: enumerate blog-index pages from /pages so blogs
    // with zero articles still appear (better UX than dedupe via /articles).
    // 2.E.1 ships a dedicated /blogs endpoint that will replace this.
    const pagesData = await siteFetch<{ pages?: Array<{ id: string; pageType?: string; title?: Record<string, string>; slug: string }> }>(
      '/pages',
    )
    const list = pagesData.pages ?? []
    blogs.value = list
      .filter(p => p.pageType === 'blog-index')
      .map(p => ({
        id: p.id,
        slug: p.slug,
        title: p.title?.['en-US'] ?? p.title?.['en-CA'] ?? p.slug,
      }))
      .sort((a, b) => a.title.localeCompare(b.title))
  } catch (e: any) {
    blogsError.value = e?.data?.statusMessage || e?.statusMessage || 'Failed to load blogs'
  } finally {
    loadingBlogs.value = false
  }
}

async function fetchTemplates() {
  if (!hasSite.value) return
  loadingTemplates.value = true
  templatesError.value = ''
  try {
    const data = await siteFetch<{ theme: any }>('/schemas')
    const raw: any[] = Array.isArray(data.theme?.templates) ? data.theme.templates : []
    // All article templates are structured by definition (component +
    // non-empty contentSchema). The wizard already filters to
    // appliesTo='article' so any drift is a theme-config bug, not user state.
    allTemplates.value = raw
      .filter(t => t && typeof t.id === 'string')
      .map(t => ({
        id: t.id,
        label: getLocalizedLabel(t.label, locale?.value) || t.id,
        appliesTo: typeof t.appliesTo === 'string' ? t.appliesTo : '',
        layoutId: typeof t.layoutId === 'string' ? t.layoutId : 'default',
      }))
    templatesLoaded.value = true
  } catch (e: any) {
    templatesError.value = e?.data?.statusMessage || e?.statusMessage || 'Failed to load templates'
  } finally {
    loadingTemplates.value = false
  }
}

// ─── Submit ────────────────────────────────────────────────────────────────
async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const res = await siteFetch<{ id: string; slug: string; blogId: string; templateId: string }>(
      '/articles',
      {
        method: 'POST',
        body: {
          blogId: form.value.blogId,
          templateId: form.value.templateId,
          title: form.value.title.trim(),
        },
      },
    )
    // Edit page (2.D.3) ships next; until then this navigates to a 404
    // placeholder — that's documented in the plan.
    await navigateTo(adminUrl(`/articles/${res.id}`))
  } catch (e: any) {
    submitError.value = e?.data?.statusMessage || e?.statusMessage || 'Failed to create article'
  } finally {
    submitting.value = false
  }
}

function cancel() {
  navigateTo(adminUrl('/articles'))
}

// ─── Assistant prefill ──────────────────────────────────────────────────────
const prefillStore = useAssistantPrefillStore()
/** Resolves when the mount-time fetchers settle; consume must wait for vocab. */
let initialLoad: Promise<unknown> = Promise.resolve()

async function tryConsumePrefill() {
  await initialLoad
  const prefill = prefillStore.consume('admin-context-articles-new')
  if (!prefill || prefill.kind !== 'admin-context-articles-new') return
  const { patch, applied, dropped } = applyArticlesNewPrefill(prefill, {
    blogs: blogs.value,
    templates: articleTemplates.value,
  })
  // Dependency order per spec §4.3: blogId → templateId → title.
  if (patch.blogId !== undefined) form.value.blogId = patch.blogId
  if (patch.templateId !== undefined) form.value.templateId = patch.templateId
  if (patch.title !== undefined) form.value.title = patch.title
  // Land the wizard on the first incomplete step (canJumpToStep semantics).
  step.value = !form.value.blogId ? 1 : !form.value.templateId ? 2 : 3
  prefillStore.report({ applied, dropped })
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(() => {
  if (hasSite.value) {
    initialLoad = Promise.all([fetchBlogs(), fetchTemplates()])
    tryConsumePrefill()
  }
})

watch(siteId, (id) => {
  if (id) {
    fetchBlogs()
    fetchTemplates()
  }
})

// Same-route stage: a prefill arriving while this page is already open
// (create-over-create) never remounts it — consume reactively too.
watch(() => prefillStore.stagedKind, (kind) => {
  if (kind === 'admin-context-articles-new') tryConsumePrefill()
})

// Auto-fetch templates when the user reaches step 2 if not already loaded.
watch(step, (next) => {
  if (next === 2 && !templatesLoaded.value && !loadingTemplates.value) {
    fetchTemplates()
  }
})
</script>

<style scoped>
.article-new__card {
  background: var(--cms-surface);
  border: 1px solid var(--cms-line);
  border-radius: 0.4rem;
  padding: 2rem;
  max-width: 72rem;
}

.article-new__stepper {
  display: flex;
  gap: 0.4rem;
  border-bottom: 1px solid var(--cms-line);
  margin: -2rem -2rem 2rem -2rem;
  padding: 0 2rem;
}
.article-new__step {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 1rem 1.4rem;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--cms-ink-subtle);
  cursor: pointer;
  font-size: 1.3rem;
}
.article-new__step:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.article-new__step--complete {
  color: var(--cms-ink-body);
}
.article-new__step--active {
  color: var(--cms-accent);
  border-bottom-color: var(--cms-accent);
  font-weight: 500;
}
.article-new__step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--cms-surface-sunken);
  color: var(--cms-ink-body);
  font-size: 1.1rem;
  font-weight: 500;
}
.article-new__step--active .article-new__step-num {
  background: var(--cms-accent);
  color: var(--cms-ink-inverse);
}
.article-new__step--complete .article-new__step-num {
  background: var(--cms-ink);
  color: var(--cms-ink-inverse);
}

.article-new__step-pane {
  min-height: 16rem;
}

.article-new__heading {
  font-size: 1.6rem;
  font-weight: 500;
  margin-bottom: 1.5rem;
  color: var(--cms-ink-body);
}

.article-new__empty {
  text-align: center;
  padding: 3rem 0;
}

.article-new__templates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
  gap: 1.2rem;
}
.article-new__template-card {
  text-align: left;
  background: var(--cms-surface);
  border: 1px solid var(--cms-line);
  border-radius: 0.4rem;
  padding: 1.4rem;
  cursor: pointer;
  position: relative;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.article-new__template-card:hover {
  border-color: #b6b8ba;
}
.article-new__template-card--active {
  border-color: var(--cms-accent);
  box-shadow: 0 0 0 2px rgba(27, 138, 183, 0.2);
}
.article-new__template-sketch {
  margin-bottom: 1rem;
}
.article-new__template-label {
  font-size: 1.4rem;
  font-weight: 500;
  color: var(--cms-ink-body);
  margin-bottom: 0.4rem;
}
.article-new__template-id {
  display: block;
  font-size: 1.1rem;
  color: var(--cms-ink-subtle);
}

.article-new__slug-preview {
  margin-top: 0.6rem;
  font-size: 1.2rem;
  color: var(--cms-ink-muted);
}
.article-new__slug-preview code {
  background: var(--cms-surface-subtle);
  padding: 0.1rem 0.4rem;
  border-radius: 0.2rem;
}

.article-new__actions {
  display: flex;
  justify-content: space-between;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--cms-line);
}
.article-new__actions-right {
  display: flex;
  gap: 0.8rem;
}
</style>
