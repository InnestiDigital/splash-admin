<template>
  <AdminPageHeader :title="t('admin.nav.newBlog', 'New blog')" alert-context="blogs" />

  <div class="blog-new__card">
    <!-- Stepper ------------------------------------------------------- -->
    <div class="blog-new__stepper">
      <button
        v-for="(label, idx) in STEP_LABELS"
        :key="idx"
        type="button"
        class="blog-new__step"
        :class="{
          'blog-new__step--active': step === idx + 1,
          'blog-new__step--complete': step > idx + 1,
        }"
        :disabled="!canJumpToStep(idx + 1)"
        @click="canJumpToStep(idx + 1) && (step = (idx + 1) as 1 | 2)"
      >
        <span class="blog-new__step-num">{{ idx + 1 }}</span>
        <span class="blog-new__step-label">{{ label }}</span>
      </button>
    </div>

    <!-- Step 1: Pick template ----------------------------------------- -->
    <section v-if="step === 1" class="blog-new__step-pane">
      <h3 class="blog-new__heading">{{ t('admin.contentForms.chooseTemplate', 'Choose a template') }}</h3>

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

      <div v-else-if="blogTemplates.length === 0" class="blog-new__empty">
        <p class="text-muted" style="font-size: 1.5rem;">
          {{ t('admin.contentForms.noBlogTemplates', 'This theme has no blog templates.') }}
        </p>
        <p class="text-muted" style="font-size: 1.3rem;">
          Add a template with <code>appliesTo: "blog-index"</code> to the theme manifest.
        </p>
      </div>

      <div v-else class="blog-new__templates">
        <button
          v-for="t in blogTemplates"
          :key="t.id"
          type="button"
          class="blog-new__template-card"
          :class="{ 'blog-new__template-card--active': form.templateId === t.id }"
          @click="form.templateId = t.id"
        >
          <TemplateSketch class="blog-new__template-sketch" :template-id="t.id" />
          <div class="blog-new__template-label">{{ t.label }}</div>
          <code class="blog-new__template-id">{{ t.id }}</code>
        </button>
      </div>
    </section>

    <!-- Step 2: Title ------------------------------------------------- -->
    <section v-else-if="step === 2" class="blog-new__step-pane">
      <h3 class="blog-new__heading">{{ t('admin.contentForms.title', 'Title') }}</h3>

      <div class="cms-form-group">
        <label class="cms-label" for="blog-title">{{ t('admin.contentForms.blogTitle', 'Blog title') }}</label>
        <input
          id="blog-title"
          v-model.trim="form.title"
          type="text"
          class="cms-form-control"
          placeholder="e.g. Notes from the Splash team"
          maxlength="200"
          autocomplete="off"
          @keydown.enter.prevent="submit()"
        />
        <div v-if="slugPreview" class="blog-new__slug-preview">
          {{ t('admin.contentForms.url', 'URL') }}: <code>/{{ slugPreview }}</code>
        </div>
      </div>

      <div v-if="submitError" class="cms-alert cms-alert--danger">
        <span class="material-icons-outlined cms-alert-icon">error</span>
        <div class="cms-alert-content">
          <div class="cms-alert-title">{{ t('admin.contentForms.createBlogFailed', 'Failed to create blog') }}</div>
          <div class="cms-alert-description">{{ submitError }}</div>
        </div>
      </div>
    </section>

    <!-- Footer actions ------------------------------------------------ -->
    <div class="blog-new__actions">
      <button
        type="button"
        class="cms-btn cms-btn--secondary"
        @click="cancel()"
      >
        {{ t('admin.shared.cancel', 'Cancel') }}
      </button>
      <div class="blog-new__actions-right">
        <button
          v-if="step > 1"
          type="button"
          class="cms-btn cms-btn--secondary"
          @click="step = (step - 1) as 1 | 2"
        >
          {{ t('common.back', 'Back') }}
        </button>
        <button
          v-if="step < 2"
          type="button"
          class="cms-btn cms-btn--primary"
          :disabled="!canAdvance"
          @click="step = (step + 1) as 1 | 2"
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
          {{ t('admin.contentForms.createBlog', 'Create blog') }}
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
import { applyBlogsNewPrefill } from '~/admin/utils/prefill/adapters/blogsNew'

definePageMeta({ layout: 'admin' })

const { t, locale } = useAdminI18n()
const STEP_LABELS = computed(() => [t('admin.contentForms.templateStep', 'Template'), t('admin.contentForms.detailsStep', 'Details')] as const)

const { adminUrl } = useAdminUrl()
const { siteId, hasSite } = useSite()
const { siteFetch } = useSiteApi()

const step = ref<1 | 2>(1)

interface TemplateOption {
  id: string
  label: string
  appliesTo: string
  layoutId: string
}

const allTemplates = ref<TemplateOption[]>([])
const loadingTemplates = ref(false)
const templatesError = ref('')
const templatesLoaded = ref(false)

const form = ref({
  templateId: '',
  title: '',
})

const submitting = ref(false)
const submitError = ref('')

const blogTemplates = computed(() =>
  allTemplates.value.filter(t => t.appliesTo === 'blog-index'),
)

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
  if (step.value === 1) return !!form.value.templateId
  return false
})

const canSubmit = computed(() =>
  !submitting.value
  && !!form.value.templateId
  && form.value.title.trim().length > 0,
)

function canJumpToStep(target: 1 | 2): boolean {
  if (target === 1) return true
  if (target === 2) return !!form.value.templateId
  return false
}

async function fetchTemplates() {
  if (!hasSite.value) return
  loadingTemplates.value = true
  templatesError.value = ''
  try {
    const data = await siteFetch<{ theme: any }>('/schemas')
    const raw: any[] = Array.isArray(data.theme?.templates) ? data.theme.templates : []
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

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const res = await siteFetch<{ id: string; slug: string; templateId: string }>(
      '/blogs',
      {
        method: 'POST',
        body: {
          templateId: form.value.templateId,
          title: form.value.title.trim(),
        },
      },
    )
    await navigateTo(adminUrl(`/blogs/${res.id}`))
  } catch (e: any) {
    submitError.value = e?.data?.statusMessage || e?.statusMessage || 'Failed to create blog'
  } finally {
    submitting.value = false
  }
}

function cancel() {
  navigateTo(adminUrl('/blogs'))
}

// ─── Assistant prefill ──────────────────────────────────────────────────────
const prefillStore = useAssistantPrefillStore()
let initialLoad: Promise<unknown> = Promise.resolve()

async function tryConsumePrefill() {
  await initialLoad
  const prefill = prefillStore.consume('admin-context-blogs-new')
  if (!prefill || prefill.kind !== 'admin-context-blogs-new') return
  const { patch, applied, dropped } = applyBlogsNewPrefill(prefill, {
    templates: blogTemplates.value,
  })
  if (patch.templateId !== undefined) form.value.templateId = patch.templateId
  if (patch.title !== undefined) form.value.title = patch.title
  step.value = form.value.templateId ? 2 : 1
  prefillStore.report({ applied, dropped })
}

onMounted(() => {
  if (hasSite.value) {
    initialLoad = fetchTemplates()
    tryConsumePrefill()
  }
})

watch(siteId, (id) => {
  if (id) fetchTemplates()
})

watch(() => prefillStore.stagedKind, (kind) => {
  if (kind === 'admin-context-blogs-new') tryConsumePrefill()
})
</script>

<style scoped>
.blog-new__card {
  background: var(--cms-surface);
  border: 1px solid var(--cms-line);
  border-radius: 0.4rem;
  padding: 2rem;
  max-width: 72rem;
}

.blog-new__stepper {
  display: flex;
  gap: 0.4rem;
  border-bottom: 1px solid var(--cms-line);
  margin: -2rem -2rem 2rem -2rem;
  padding: 0 2rem;
}
.blog-new__step {
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
.blog-new__step:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.blog-new__step--complete {
  color: var(--cms-ink-body);
}
.blog-new__step--active {
  color: var(--cms-accent);
  border-bottom-color: var(--cms-accent);
  font-weight: 500;
}
.blog-new__step-num {
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
.blog-new__step--active .blog-new__step-num {
  background: var(--cms-accent);
  color: var(--cms-ink-inverse);
}
.blog-new__step--complete .blog-new__step-num {
  background: var(--cms-ink);
  color: var(--cms-ink-inverse);
}

.blog-new__step-pane {
  min-height: 16rem;
}

.blog-new__heading {
  font-size: 1.6rem;
  font-weight: 500;
  margin-bottom: 1.5rem;
  color: var(--cms-ink-body);
}

.blog-new__empty {
  text-align: center;
  padding: 3rem 0;
}

.blog-new__templates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
  gap: 1.2rem;
}
.blog-new__template-card {
  text-align: left;
  background: var(--cms-surface);
  border: 1px solid var(--cms-line);
  border-radius: 0.4rem;
  padding: 1.4rem;
  cursor: pointer;
  position: relative;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.blog-new__template-card:hover {
  border-color: #b6b8ba;
}
.blog-new__template-card--active {
  border-color: var(--cms-accent);
  box-shadow: 0 0 0 2px rgba(27, 138, 183, 0.2);
}
.blog-new__template-sketch {
  margin-bottom: 1rem;
}
.blog-new__template-label {
  font-size: 1.4rem;
  font-weight: 500;
  color: var(--cms-ink-body);
  margin-bottom: 0.4rem;
}
.blog-new__template-id {
  display: block;
  font-size: 1.1rem;
  color: var(--cms-ink-subtle);
}

.blog-new__slug-preview {
  margin-top: 0.6rem;
  font-size: 1.2rem;
  color: var(--cms-ink-muted);
}
.blog-new__slug-preview code {
  background: var(--cms-surface-subtle);
  padding: 0.1rem 0.4rem;
  border-radius: 0.2rem;
}

.blog-new__actions {
  display: flex;
  justify-content: space-between;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--cms-line);
}
.blog-new__actions-right {
  display: flex;
  gap: 0.8rem;
}
</style>
