<template>
  <AdminPageHeader
    :title="t('admin.pages.title', 'Pages')"
    :description="t('admin.pages.description', 'Create, organize, and open the pages that make up this website.')"
    alert-context="pages"
  >
    <template #actions>
      <button
        class="cms-btn cms-btn--primary"
        @click="showCreateForm = true"
      >
        <span class="material-icons-outlined" aria-hidden="true">add</span>
        {{ t('admin.pages.add', 'Add page') }}
      </button>
    </template>
  </AdminPageHeader>

  <UiDrawer
    :open="showCreateForm"
    :title="t('admin.pages.createTitle', 'Create a page')"
    :description="t('admin.pages.createDescription', 'Name the page first. Splash will help place and style it.')"
    :eyebrow="t('admin.nav.content', 'Content')"
    :dismissible="!creating"
    @close="showCreateForm = false"
  >
    <div class="page-create-form">
      <div class="cms-form-group">
        <label for="create-page-title" class="cms-label">{{ t('admin.pages.pageTitle', 'Page title') }}</label>
        <input id="create-page-title" v-model="createForm.titleEnUS" type="text" class="cms-form-control" placeholder="About us" autofocus />
      </div>

      <div class="cms-form-group">
        <label for="create-page-path" class="cms-label">{{ t('admin.pages.urlPath', 'URL path') }}</label>
        <input id="create-page-path" v-model="createForm.slug" type="text" class="cms-form-control" placeholder="about-us" @input="slugManuallyEdited = true" />
        <div class="cms-form-hint">{{ t('admin.pages.pathHint', 'Use a short, readable path. You can change it later.') }}</div>
      </div>

      <fieldset class="cms-form-group">
        <legend class="cms-label">{{ t('admin.pages.kind', 'What are you creating?') }}</legend>
        <div class="page-create-type">
          <label v-for="opt in PAGE_TYPE_OPTIONS" :key="opt.value" class="page-create-type__option" :class="{ 'page-create-type__option--active': createForm.pageType === opt.value }">
            <input v-model="createForm.pageType" type="radio" :value="opt.value" class="page-create-type__radio" />
            <span class="page-create-type__label">{{ opt.label }}</span>
            <span class="page-create-type__desc">{{ opt.description }}</span>
          </label>
        </div>
      </fieldset>

      <div v-if="createForm.pageType === 'article'" class="cms-form-group">
        <label for="create-page-parent" class="cms-label">{{ t('admin.pages.blog', 'Blog') }}</label>
        <select id="create-page-parent" v-model="createForm.parentId" class="cms-form-control">
          <option v-for="page in availableParents" :key="page.id" :value="page.id">{{ page.title?.['en-US'] || page.title?.['en-CA'] || page.slug }}</option>
        </select>
        <div v-if="availableParents.length === 0" class="cms-form-hint">No blog is ready yet. Create a blog first, then return here.</div>
      </div>

      <div v-else class="cms-form-group">
        <label for="create-page-parent" class="cms-label">{{ t('admin.pages.parent', 'Parent page') }} <span class="cms-label-optional">{{ t('common.optional', 'Optional') }}</span></label>
        <select id="create-page-parent" v-model="createForm.parentId" class="cms-form-control">
          <option :value="null">{{ t('admin.pages.topLevel', 'Top level') }}</option>
          <option v-for="page in availableParents" :key="page.id" :value="page.id">{{ page.title?.['en-US'] || page.title?.['en-CA'] || page.slug }}</option>
        </select>
        <div class="cms-form-hint">{{ t('admin.pages.parentHint', 'Choose a parent only when this page belongs beneath another page.') }}</div>
      </div>

      <div v-if="availableTemplates.length > 1 || templateRequired" class="cms-form-group">
        <label for="create-page-template" class="cms-label">{{ t('admin.pages.template', 'Template') }}</label>
        <select id="create-page-template" v-model="createForm.templateId" class="cms-form-control" :disabled="availableTemplates.length === 0">
          <option v-if="!templateRequired" :value="null">{{ t('admin.pages.defaultTemplate', 'Use the default') }}</option>
          <option v-for="tpl in availableTemplates" :key="tpl.id" :value="tpl.id">{{ tpl.label }}</option>
        </select>
        <div v-if="availableTemplates.length === 0" class="cms-form-hint">Ask an administrator to add a compatible template.</div>
      </div>

      <div class="page-create-actions">
        <button
          type="button"
          class="cms-btn cms-btn--primary"
          :disabled="creating || !canCreate"
          @click="doCreate"
        >
          <span v-if="creating" class="cms-btn-spinner" />
          {{ creating ? 'Creating…' : 'Create page' }}
        </button>
        <button
          type="button"
          class="cms-btn cms-btn--secondary"
          :disabled="creating"
          @click="showCreateForm = false"
        >
          {{ t('admin.shared.cancel', 'Cancel') }}
        </button>
      </div>
    </div>
  </UiDrawer>

  <!-- Loading -->
  <UiAsyncState v-if="loading" type="loading" :title="t('admin.pages.loading', 'Loading pages')" :description="t('admin.pages.loadingDescription', 'Preparing your content library…')" />

  <!-- Error -->
  <UiAsyncState v-else-if="error" type="error" :title="t('admin.pages.loadFailed', 'Pages couldn’t be loaded')" :description="error" @retry="fetchPages" />

  <!-- Empty -->
  <UiEmptyState v-else-if="pages.length === 0" size="page" icon="article" :title="t('admin.pages.empty', 'Create your first page')" :description="t('admin.pages.emptyDescription', 'Pages hold the content and structure of your website.')">
    <template #action><button type="button" class="cms-btn cms-btn--primary" @click="showCreateForm = true">{{ t('admin.pages.add', 'Add page') }}</button></template>
  </UiEmptyState>

  <template v-else>
    <!-- Filter row -->
    <div class="page-list__filters">
      <button
        v-for="f in pageListFilters"
        :key="f.id"
        type="button"
        class="page-list__filter-btn"
        :class="{ 'page-list__filter-btn--active': activeFilter === f.id }"
        :aria-pressed="activeFilter === f.id"
        @click="activeFilter = f.id"
      >
        {{ f.label }}
      </button>
    </div>

    <!-- Pages table -->
    <UiEmptyState v-if="filteredPages.length === 0" :title="t('admin.pages.noMatch', 'No pages match this view')" :description="t('admin.pages.noMatchDescription', 'Choose another filter to see more content.')">
      <template #action><button type="button" class="cms-btn cms-btn--secondary cms-btn--sm" @click="activeFilter = 'all'">{{ t('admin.pages.showAll', 'Show all pages') }}</button></template>
    </UiEmptyState>
    <div v-else class="cms-table-wrapper page-table">
    <table class="cms-table">
      <thead>
        <tr>
          <th>{{ t('admin.pages.path', 'Path') }}</th>
          <th>{{ t('admin.collections.title', 'Title') }}</th>
          <th>{{ t('admin.pages.type', 'Type') }}</th>
          <th class="page-table__optional">{{ t('admin.pages.layout', 'Layout') }}</th>
          <th class="page-table__optional">{{ t('admin.pages.order', 'Order') }}</th>
          <th>{{ t('admin.pages.status', 'Status') }}</th>
          <th class="page-table__optional">{{ t('admin.pages.access', 'Access') }}</th>
          <th class="text-end">{{ t('admin.collections.actions', 'Actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="page in filteredPages" :key="page.id" :class="{ 'page-table__row--editing': editingId === page.id }">
          <!-- Inline editing -->
          <template v-if="editingId === page.id">
            <td>
              <input
                v-model="editForm.slug"
                type="text"
                class="cms-form-control cms-form-control--sm"
              />
            </td>
            <td>
              <input
                v-model="editForm.titleEnUS"
                type="text"
                class="cms-form-control cms-form-control--sm"
              />
            </td>
            <td>
              <span :class="`page-type-badge page-type-badge--${page.pageType ?? 'static'}`">
                {{ pageTypeLabel(page.pageType) }}
              </span>
            </td>
            <td class="page-table__optional">
              <select v-model="editForm.layout" class="cms-form-control cms-form-control--sm">
                <option v-if="!themeLayouts.length" value="default">Default</option>
                <option v-for="layout in themeLayouts" :key="layout.id" :value="layout.id">
                  {{ layoutOptionLabelFor(layout, page) }}
                </option>
              </select>
              <div v-if="editLayoutRelation(page).isOverridden" class="page-table__layout-note">
                <span class="cms-badge cms-badge--muted" data-layout-overridden>Overridden</span>
                <button
                  type="button"
                  class="page-table__layout-reset"
                  data-reset-template-layout
                  @click="resetEditLayoutToTemplate(page)"
                >
                  Use template layout
                </button>
              </div>
            </td>
            <td class="page-table__optional">{{ page.position }}</td>
            <td>
              <select v-model="editForm.status" class="cms-form-control cms-form-control--sm">
                <option value="draft">{{ t('admin.pages.draft', 'Draft') }}</option>
                <option value="published">{{ t('admin.pages.published', 'Published') }}</option>
              </select>
            </td>
            <td class="page-table__optional">
              <input
                v-model="editForm.requireAuth"
                type="checkbox"
                class="cms-checkbox"
              />
            </td>
            <td class="text-end">
              <div class="d-flex gap-1 justify-content-end">
                <button
                  class="cms-btn cms-btn--primary cms-btn--sm"
                  :disabled="saving"
                  @click="doSave(page.id)"
                >
                  {{ saving ? 'Saving...' : 'Save' }}
                </button>
                <button
                  class="cms-btn cms-btn--secondary cms-btn--sm"
                  :disabled="saving"
                  @click="cancelEdit"
                >
                  {{ t('admin.shared.cancel', 'Cancel') }}
                </button>
              </div>
            </td>
          </template>

          <!-- Read-only row -->
          <template v-else>
            <td>
              <code>{{ getFullPath(page) }}</code>
              <span v-if="page.parentId" class="cms-badge cms-badge--muted" style="margin-left:6px;font-size:1rem;">child</span>
            </td>
            <td>{{ page.title?.['en-US'] || page.title?.['en-CA'] || '—' }}</td>
            <td>
              <span :class="`page-type-badge page-type-badge--${page.pageType ?? 'static'}`">
                {{ pageTypeLabel(page.pageType) }}
              </span>
            </td>
            <td class="page-table__optional">
              {{ page.layout }}
              <span
                v-if="savedLayoutRelation(page).isOverridden"
                class="cms-badge cms-badge--muted"
                data-layout-overridden
              >Overridden</span>
              <span
                v-else-if="savedLayoutRelation(page).isTemplateDefault"
                class="page-table__layout-default"
              >{{ TEMPLATE_DEFAULT_SUFFIX }}</span>
            </td>
            <td class="page-table__optional">{{ page.position }}</td>
            <td>
              <div class="d-flex align-items-center gap-2">
                <template v-if="page.pageType === 'article'">
                  <StatusPill :status="(page.status ?? (page.published ? 'published' : 'draft'))" />
                  <button
                    class="cms-btn cms-btn--secondary cms-btn--sm"
                    :disabled="publishBusyIds.has(page.id)"
                    data-action="toggle-publish"
                    @click="togglePublishOnList(page)"
                  >
                    <span v-if="publishBusyIds.has(page.id)" class="cms-btn-spinner" />
                    {{ (page.status ?? (page.published ? 'published' : 'draft')) === 'published' ? 'Unpublish' : 'Publish' }}
                  </button>
                </template>
                <select
                  v-else
                  :value="(page.status ?? (page.published ? 'published' : 'draft'))"
                  class="cms-form-control cms-form-control--sm"
                  :disabled="statusUpdating === page.id"
                  @change="onStatusChange(page, ($event.target as HTMLSelectElement).value as 'draft' | 'published')"
                >
                  <option value="draft">{{ t('admin.pages.draft', 'Draft') }}</option>
                  <option value="published">{{ t('admin.pages.published', 'Published') }}</option>
                </select>
                <time
                  v-if="(page.status ?? (page.published ? 'published' : 'draft')) === 'published' && page.publishedAt"
                  class="page-list__published-at"
                  :datetime="String(page.publishedAt)"
                >
                  {{ formatDate(String(page.publishedAt)) }}
                </time>
              </div>
            </td>
            <td class="page-table__optional">
              <span v-if="(page as any).requireAuth" class="material-icons-outlined" :aria-label="t('admin.pages.restricted', 'Restricted access')">lock</span>
            </td>
            <td class="text-end">
              <details class="row-actions">
                <summary :aria-label="`Actions for ${page.title?.['en-US'] || page.slug}`">
                  <span class="material-icons-outlined" aria-hidden="true">more_horiz</span>
                </summary>
                <div class="row-actions__menu">
                  <button type="button" @click="startEdit(page)">{{ t('admin.pages.edit', 'Edit page') }}</button>
                  <button type="button" class="row-actions__danger" :disabled="deleting === page.id" @click="confirmDelete(page)">{{ t('admin.pages.delete', 'Delete page') }}</button>
                </div>
              </details>
            </td>
          </template>
        </tr>
      </tbody>
    </table>
    </div>
  </template>

  <UiModal
    :open="deleteTarget !== null"
    :title="t('admin.pages.deleteTitle', `Delete ${deleteTargetTitle}?`, { title: deleteTargetTitle })"
    :dismissible="deleting === null"
    @close="deleteTarget = null"
  >
    <template #description>
      {{ t('admin.pages.deleteDescription', 'This permanently removes the page and its content. This action cannot be undone.') }}
    </template>
    <template #footer>
      <button type="button" class="cms-btn cms-btn--secondary" :disabled="deleting !== null" @click="deleteTarget = null">{{ t('admin.shared.cancel', 'Cancel') }}</button>
      <button type="button" class="cms-btn cms-btn--danger" :disabled="deleting !== null" @click="deleteTarget && doDelete(deleteTarget)">
        <span v-if="deleting !== null" class="cms-btn-spinner" />
        {{ deleting !== null ? 'Deleting…' : 'Delete page' }}
      </button>
    </template>
  </UiModal>
</template>

<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import { useAlertStore } from '~/admin/stores/alertStore'
import { useAssistantPrefillStore } from '~/admin/stores/assistantPrefillStore'
import { applyPagesCreatePrefill } from '~/admin/utils/prefill/adapters/pagesCreate'
import { useSite } from '~/admin/composables/useSite'
import { useSiteApi } from '~/admin/composables/useSiteApi'
import { getLocalizedLabel } from '~/admin/utils/labelUtils'
import { formatDate } from '~/admin/utils/formatters'
import {
  TEMPLATE_DEFAULT_SUFFIX,
  layoutOptionLabelWithTemplateDefault,
  resolveLayoutRelation,
} from '~/admin/utils/templateRelation'
import {
  filterPagesForList,
  pageTypeLabel,
  PAGE_LIST_FILTERS,
  type PageListFilterId,
} from '~/admin/utils/pageListFilters'
import StatusPill from '~/admin/components/pageSettings/StatusPill.vue'
import UiModal from '~/admin/components/ui/UiModal.vue'
import UiAsyncState from '~/admin/components/ui/UiAsyncState.vue'
import UiEmptyState from '~/admin/components/ui/UiEmptyState.vue'
import UiDrawer from '~/admin/components/ui/UiDrawer.vue'
import { publishArticle, unpublishArticle } from '~/admin/composables/useArticlePublish'
import type { PageSummary } from '~/server/storage/types'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

definePageMeta({ layout: 'admin' })

const { siteId, hasSite } = useSite()
const { siteFetch } = useSiteApi()
const alertStore = useAlertStore()
const { t, locale } = useAdminI18n()

type PageType = 'static' | 'blog-index' | 'article'

interface ThemeTemplateSummary {
  id: string
  label: string
  appliesTo: PageType
  layoutId: string
}

const PAGE_TYPE_OPTIONS: Array<{ value: PageType; label: string; description: string }> = [
  { value: 'static', label: 'Static', description: 'Plain page' },
  { value: 'blog-index', label: 'Blog Home', description: 'Lists articles' },
  { value: 'article', label: 'Article', description: 'Lives under a Blog Home' },
]

const pages = ref<PageSummary[]>([])
const loading = ref(true)
const error = ref('')
const themeLayouts = ref<Array<{ id: string; label: string | Record<string, string> }>>([])
const themeTemplates = ref<ThemeTemplateSummary[]>([])

async function fetchThemeLayouts() {
  try {
    const data = await siteFetch<{ theme: any }>('/schemas')
    themeLayouts.value = data.theme?.layout?.layouts || []
    const rawTemplates: any[] = Array.isArray(data.theme?.templates) ? data.theme.templates : []
    themeTemplates.value = rawTemplates
      .filter(t => t && typeof t.id === 'string')
      .map(t => ({
        id: t.id,
        label: getLocalizedLabel(t.label, locale?.value) || t.id,
        appliesTo: t.appliesTo as PageType,
        layoutId: typeof t.layoutId === 'string' ? t.layoutId : 'default',
      }))
  } catch {
    // Non-critical — fall back to just "Default"
  }
}

// Create
const showCreateForm = ref(false)
const creating = ref(false)
const createForm = reactive({
  slug: '',
  titleEnUS: '',
  parentId: null as string | null,
  pageType: 'static' as PageType,
  templateId: null as string | null,
})
const slugManuallyEdited = ref(false)

watch(() => createForm.titleEnUS, (title) => {
  if (slugManuallyEdited.value) return
  createForm.slug = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
})

// Templates whose appliesTo matches the chosen pageType.
const availableTemplates = computed(() => {
  return themeTemplates.value.filter(t => t.appliesTo === createForm.pageType)
})

// blog-index + article require a templateId per validator. Static does not.
const templateRequired = computed(() => createForm.pageType !== 'static')

// Article parents must be blog-index pages. Other types pick from non-article
// top-level pages (mirrors the historical "topLevelPages" allow-list).
const availableParents = computed(() => {
  if (createForm.pageType === 'article') {
    return pages.value.filter(p => p.pageType === 'blog-index')
  }
  return pages.value.filter(p => !p.parentId && p.pageType !== 'article')
})

const canCreate = computed(() => {
  if (!createForm.slug || !createForm.titleEnUS) return false
  if (templateRequired.value && !createForm.templateId) return false
  if (createForm.pageType === 'article' && !createForm.parentId) return false
  return true
})

// Reset templateId + parentId when pageType changes so we never submit a
// mismatch to the API. The validator would reject it anyway, but a fresh form
// state prevents confusing dropdown selections persisting across types.
watch(() => createForm.pageType, (next) => {
  // Try to preserve a valid template choice; otherwise clear it.
  const stillValid = themeTemplates.value.some(t => t.id === createForm.templateId && t.appliesTo === next)
  if (!stillValid) {
    const firstMatch = themeTemplates.value.find(t => t.appliesTo === next)
    createForm.templateId = firstMatch ? firstMatch.id : null
  }
  // Article parent must be a blog-index. Other types start at no parent.
  createForm.parentId = null
})

// Auto-select the first matching template when the templates list arrives
// (after fetchThemeLayouts resolves).
watch(themeTemplates, (next) => {
  if (createForm.templateId) return
  const firstMatch = next.find(t => t.appliesTo === createForm.pageType)
  if (firstMatch) createForm.templateId = firstMatch.id
})

function getFullPath(page: PageSummary): string {
  if (!page.parentId) return page.slug
  const parent = pages.value.find(p => p.id === page.parentId)
  return parent ? `${parent.slug}/${page.slug}` : page.slug
}

// Filter
const pageListFilters = PAGE_LIST_FILTERS
const route = useRoute()
const router = useRouter()
const queryFilter = (route.query.filter as string | undefined) ?? ''
const initialFilter: PageListFilterId =
  PAGE_LIST_FILTERS.find(f => f.id === queryFilter)?.id ?? 'all'
const activeFilter = ref<PageListFilterId>(initialFilter)
const filteredPages = computed(() => filterPagesForList(pages.value, activeFilter.value))

// Keep URL in sync with the active filter so deep links + the admin nav
// "Blogs"/"Articles" shortcuts stay consistent.
watch(activeFilter, (next) => {
  const query = { ...route.query }
  if (next === 'all') delete query.filter
  else query.filter = next
  router.replace({ query })
})

// External nav (e.g. clicking another nav entry) updates route.query.filter
// without remounting this page — keep activeFilter in sync.
watch(() => route.query.filter, (next) => {
  const id = typeof next === 'string'
    ? PAGE_LIST_FILTERS.find(f => f.id === next)?.id
    : undefined
  activeFilter.value = id ?? 'all'
})

// Edit
const editingId = ref<string | null>(null)
const saving = ref(false)
const deleting = ref<string | null>(null)
const deleteTarget = ref<PageSummary | null>(null)
const deleteTargetTitle = computed(() => {
  const page = deleteTarget.value
  return page?.title?.['en-US'] || page?.title?.['en-CA'] || page?.slug || 'this page'
})
const statusUpdating = ref<string | null>(null)
const editForm = reactive({
  slug: '',
  titleEnUS: '',
  layout: '',
  status: 'draft' as 'draft' | 'published',
  requireAuth: false,
})

const prefillStore = useAssistantPrefillStore()
let initialLoad: Promise<unknown> = Promise.resolve()

async function tryConsumePrefill() {
  await initialLoad
  const prefill = prefillStore.consume('admin-context-pages')
  if (!prefill || prefill.kind !== 'admin-context-pages') return
  const { patch, applied, dropped } = applyPagesCreatePrefill(
    prefill,
    { pages: pages.value, templates: themeTemplates.value },
    createForm.pageType,
  )
  showCreateForm.value = true
  if (patch.pageType !== undefined) createForm.pageType = patch.pageType
  // Let the pageType watcher run its reset BEFORE the dependent fields land.
  await nextTick()
  if (patch.parentId !== undefined) createForm.parentId = patch.parentId
  if (patch.templateId !== undefined) createForm.templateId = patch.templateId
  if (patch.titleEnUS !== undefined) createForm.titleEnUS = patch.titleEnUS
  // slug derives from the title watcher; slugManuallyEdited stays false.
  prefillStore.report({ applied, dropped })
}

onMounted(async () => {
  if (hasSite.value) {
    initialLoad = Promise.all([fetchPages(), fetchThemeLayouts()])
    await initialLoad
    tryConsumePrefill()
  }
})

watch(() => prefillStore.stagedKind, (kind) => {
  if (kind === 'admin-context-pages') tryConsumePrefill()
})

watch(siteId, (newId) => {
  if (newId) {
    fetchPages()
    fetchThemeLayouts()
  }
})

async function fetchPages() {
  if (!hasSite.value) return
  loading.value = true
  error.value = ''
  try {
    const data = await siteFetch<{ pages: PageSummary[] }>('/pages')
    pages.value = (data.pages || []).sort((a, b) => a.position - b.position)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Failed to load pages'
  } finally {
    loading.value = false
  }
}

async function doCreate() {
  creating.value = true
  alertStore.clearContext('pages')
  try {
    // Layout is derived from the chosen template's layoutId per spec § 3.4.
    // Falls back to 'default' for static pages without a template.
    const tpl = themeTemplates.value.find(t => t.id === createForm.templateId)
    const layout = tpl?.layoutId ?? 'default'
    const created = await siteFetch<{ page: PageSummary }>('/pages', {
      method: 'POST',
      body: {
        slug: createForm.slug,
        title: { 'en-US': createForm.titleEnUS, 'en-CA': createForm.titleEnUS },
        layout,
        dynamic: true,
        parentId: createForm.parentId ?? undefined,
        pageType: createForm.pageType,
        templateId: createForm.templateId ?? undefined,
      },
    })
    alertStore.success('Page created.', undefined, 'pages')
    showCreateForm.value = false
    createForm.slug = ''
    createForm.titleEnUS = ''
    createForm.parentId = null
    createForm.pageType = 'static'
    createForm.templateId = null
    slugManuallyEdited.value = false
    await fetchPages()
    await router.push({
      path: `/admin/p/${route.params.programId}/s/${route.params.siteId}/editor`,
      query: { pageId: created.page.id },
    })
  } catch (e: any) {
    alertStore.danger(
      'Create failed.',
      e?.data?.statusMessage || 'Could not create the page.',
      'pages'
    )
  } finally {
    creating.value = false
  }
}

/**
 * A page's template declares a layout. The list makes that relationship
 * visible — labelled default, "Overridden" badge, one-click way back — but
 * never constrains the choice (D7 / WP-16).
 */
function templateLayoutIdFor(page: PageSummary): string | null {
  if (!page.templateId) return null
  return themeTemplates.value.find(tpl => tpl.id === page.templateId)?.layoutId ?? null
}

function savedLayoutRelation(page: PageSummary) {
  return resolveLayoutRelation(page.layout, templateLayoutIdFor(page))
}

function editLayoutRelation(page: PageSummary) {
  return resolveLayoutRelation(editForm.layout, templateLayoutIdFor(page))
}

function layoutOptionLabelFor(
  layout: { id: string; label: string | Record<string, string> },
  page: PageSummary,
): string {
  return layoutOptionLabelWithTemplateDefault(
    getLocalizedLabel(layout.label) || layout.id,
    layout.id,
    templateLayoutIdFor(page),
  )
}

function resetEditLayoutToTemplate(page: PageSummary) {
  const templateLayoutId = templateLayoutIdFor(page)
  if (templateLayoutId) editForm.layout = templateLayoutId
}

function startEdit(page: PageSummary) {
  editingId.value = page.id
  editForm.slug = page.slug
  editForm.titleEnUS = page.title?.['en-US'] || page.title?.['en-CA'] || ''
  editForm.layout = page.layout
  editForm.status = page.status ?? (page.published ? 'published' : 'draft')
  editForm.requireAuth = (page as any).requireAuth ?? false
}

function cancelEdit() {
  editingId.value = null
}

async function doSave(pageId: string) {
  saving.value = true
  alertStore.clearContext('pages')
  try {
    await siteFetch(`/pages/${pageId}`, {
      method: 'PUT',
      body: {
        slug: editForm.slug,
        title: { 'en-US': editForm.titleEnUS, 'en-CA': editForm.titleEnUS },
        layout: editForm.layout,
        status: editForm.status,
        requireAuth: editForm.requireAuth,
      },
    })
    editingId.value = null
    alertStore.success('Page updated.', undefined, 'pages')
    await fetchPages()
  } catch (e: any) {
    alertStore.danger(
      'Update failed.',
      e?.data?.statusMessage || 'Could not update the page.',
      'pages'
    )
  } finally {
    saving.value = false
  }
}

// Track which articles are mid-publish so we can disable their button + show a spinner.
// Reactive Set: mutating it via add/delete triggers Vue updates. We call new Set()
// on every mutation to guarantee reactivity in templates that read .has() — Set
// reactivity is reliable in Vue 3, so we mutate in place.
const publishBusyIds = ref<Set<string>>(new Set())

async function togglePublishOnList(page: PageSummary) {
  if (!siteId.value) return
  if (publishBusyIds.value.has(page.id)) return
  const previous = page.status ?? (page.published ? 'published' : 'draft')
  // Optimistic UI: flip the local row. If the request fails, revert.
  const optimisticStatus: 'draft' | 'published' = previous === 'published' ? 'draft' : 'published'
  ;(page as any).status = optimisticStatus
  publishBusyIds.value.add(page.id)
  publishBusyIds.value = new Set(publishBusyIds.value)
  alertStore.clearContext('pages')
  try {
    if (previous === 'published') {
      await unpublishArticle(siteId.value, page.id)
    } else {
      await publishArticle(siteId.value, page.id)
    }
    // Refetch so publishedAt + any cache-purge side-effects are reflected.
    await fetchPages()
  } catch (e: any) {
    // Revert optimistic flip
    ;(page as any).status = previous
    alertStore.danger(
      'Status update failed.',
      e?.data?.statusMessage || 'Could not update the article status.',
      'pages',
    )
  } finally {
    publishBusyIds.value.delete(page.id)
    publishBusyIds.value = new Set(publishBusyIds.value)
  }
}

async function onStatusChange(page: PageSummary, status: 'draft' | 'published') {
  statusUpdating.value = page.id
  alertStore.clearContext('pages')
  try {
    await siteFetch(`/pages/${page.id}`, {
      method: 'PUT',
      body: { status },
    })
    alertStore.success(`Page status set to ${status}.`, undefined, 'pages')
    await fetchPages()
  } catch (e: any) {
    alertStore.danger(
      'Status update failed.',
      e?.data?.statusMessage || 'Could not update the page status.',
      'pages'
    )
  } finally {
    statusUpdating.value = null
  }
}

function confirmDelete(page: PageSummary) {
  deleteTarget.value = page
}

async function doDelete(page: PageSummary) {
  deleting.value = page.id
  alertStore.clearContext('pages')
  try {
    await siteFetch(`/pages/${page.id}`, {
      method: 'DELETE',
    })
    alertStore.success('Page deleted.', undefined, 'pages')
    deleteTarget.value = null
    await fetchPages()
  } catch (e: any) {
    alertStore.danger(
      'Delete failed.',
      e?.data?.statusMessage || 'Could not delete the page.',
      'pages'
    )
  } finally {
    deleting.value = null
  }
}
</script>

<style scoped>
.cms-card {
  border: 1px solid var(--cms-line);
  border-radius: 0.2rem;
  background: var(--cms-surface);
}
.cms-card__header {
  padding: 1.2rem 1.5rem;
  border-bottom: 1px solid var(--cms-line);
}
.cms-card__title {
  font-size: 1.4rem;
  font-weight: 600;
  margin: 0;
  color: var(--cms-ink-body);
}
.cms-card__body {
  padding: 1.5rem;
}

.cms-badge--muted {
  background-color: var(--cms-surface-subtle);
  color: var(--cms-ink-subtle);
}

.cms-form-control--sm {
  padding: 0.3rem 0.6rem;
  font-size: 1.2rem;
}

.cms-checkbox {
  width: 1.6rem;
  height: 1.6rem;
  cursor: pointer;
}

.cms-table code {
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .cms-table thead .page-table__optional,
  .cms-table tbody .page-table__optional {
    display: none;
  }
}

.page-table__layout-note {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.3rem;
}

.page-table__layout-reset {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: 1.1rem;
  color: var(--cms-accent, currentColor);
  text-decoration: underline;
  cursor: pointer;
}

.page-table__layout-default {
  color: var(--cms-ink-subtle);
  font-size: 1.1rem;
}

.cms-form-hint {
  font-size: 1.1rem;
  color: var(--cms-ink-subtle);
  margin-top: 0.3rem;
}

.row-actions {
  position: relative;
  display: inline-block;
}

.row-actions[open] { z-index: var(--cms-z-dropdown); }

.row-actions summary {
  display: grid;
  width: 3.2rem;
  height: 3.2rem;
  place-items: center;
  color: var(--cms-ink-muted);
  border-radius: var(--cms-radius-control);
  cursor: pointer;
  list-style: none;
}

.row-actions summary::-webkit-details-marker { display: none; }
.row-actions summary:hover { background: var(--cms-surface-subtle); color: var(--cms-ink); }

.row-actions__menu {
  position: absolute;
  z-index: var(--cms-z-dropdown);
  top: calc(100% + 0.4rem);
  right: 0;
  width: 14rem;
  padding: 0.4rem;
  border: 1px solid var(--cms-line);
  border-radius: var(--cms-radius-control);
  background: var(--cms-surface);
  box-shadow: var(--cms-elev-2);
}

.row-actions__menu button {
  width: 100%;
  padding: 0.7rem 0.8rem;
  color: var(--cms-ink-body);
  font: inherit;
  text-align: left;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  cursor: pointer;
}

.row-actions__menu button:hover { background: var(--cms-surface-subtle); }
.row-actions__menu .row-actions__danger { color: var(--cms-danger); }

/* Filter row */
.page-list__filters {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-bottom: 1.2rem;
}
.page-list__filter-btn {
  border: 1px solid var(--cms-line);
  background: var(--cms-surface);
  color: var(--cms-ink-body);
  padding: 0.5rem 1.1rem;
  font-size: 1.2rem;
  border-radius: 0.2rem;
  cursor: pointer;
}
.page-list__filter-btn:hover {
  background: var(--cms-surface-subtle);
}
.page-list__filter-btn--active {
  background: var(--cms-ink);
  border-color: var(--cms-ink-body);
  color: var(--cms-ink-inverse);
}
.page-list__filter-btn--active:hover {
  background: var(--cms-ink);
}

/* pageType badge */
.page-type-badge {
  display: inline-block;
  padding: 0.2rem 0.7rem;
  font-size: 1.1rem;
  font-weight: 500;
  border-radius: 0.2rem;
  background: var(--cms-surface-subtle);
  color: var(--cms-ink-body);
}
.page-type-badge--blog-index {
  background: #e0f2fe;
  color: #075985;
}
.page-type-badge--article {
  background: var(--cms-warn-soft);
  color: var(--cms-warn);
}

/* publishedAt timestamp */
.page-list__published-at {
  font-size: 1.1rem;
  color: var(--cms-ink-subtle);
  white-space: nowrap;
}

/* page-type radio cards */
.page-create-type {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.8rem;
  flex-wrap: wrap;
}
.page-create-type__option {
  min-width: 0;
  border: 1px solid var(--cms-line);
  border-radius: var(--cms-radius-card);
  padding: 1rem 1.2rem;
  cursor: pointer;
  background: var(--cms-surface);
  transition: border-color var(--cms-motion-fast) var(--cms-ease-out), box-shadow var(--cms-motion-fast) var(--cms-ease-out), background-color var(--cms-motion-fast) var(--cms-ease-out);
}
.page-create-type__option:hover {
  border-color: var(--cms-ink-subtle);
}
.page-create-type__option--active {
  border-color: var(--cms-accent);
  background: var(--cms-accent-softest);
  box-shadow: 0 0 0 1px var(--cms-accent);
}
.page-create-type__radio {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
}
.page-create-type__option:has(.page-create-type__radio:focus-visible) { outline: 2px solid var(--cms-accent); outline-offset: 2px; }
.page-create-type__label {
  display: block;
  font-weight: 600;
  font-size: 1.3rem;
  color: var(--cms-ink-body);
}
.page-create-type__desc {
  display: block;
  font-size: 1.1rem;
  color: var(--cms-ink-subtle);
  margin-top: 0.2rem;
}

.page-create-actions {
  display: flex;
  position: sticky;
  bottom: -2.4rem;
  justify-content: flex-end;
  gap: 0.8rem;
  margin: 2.4rem 0 -2.4rem;
  padding: 1.6rem 0 0;
  border-top: 1px solid var(--cms-line);
  background: rgba(255, 255, 255, 0.96);
}

@media (max-width: 560px) {
  .page-create-type { grid-template-columns: 1fr; }
}

@media (max-width: 767px) {
  .page-table {
    overflow: visible;
    border: 0;
    background: transparent;
  }

  .page-table::before { display: none; }

  .page-table .cms-table,
  .page-table .cms-table tbody {
    display: block;
    min-width: 0;
  }

  .page-table .cms-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .page-table .cms-table tr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "title actions"
      "path actions"
      "type status"
      "layout layout";
    gap: 0.45rem 1rem;
    margin-bottom: 0.8rem;
    padding: 1.2rem;
    border: 1px solid var(--cms-line);
    border-radius: var(--cms-radius-card);
    background: var(--cms-surface);
  }

  .page-table .cms-table td {
    min-width: 0;
    height: auto;
    padding: 0;
    border: 0;
  }

  .page-table .cms-table td:nth-child(1) { grid-area: path; color: var(--cms-ink-subtle); }
  .page-table .cms-table td:nth-child(2) { grid-area: title; font-weight: 650; color: var(--cms-ink); }
  .page-table .cms-table td:nth-child(3) { grid-area: type; }
  .page-table .cms-table td:nth-child(4) { display: none; grid-area: layout; }
  .page-table .cms-table .page-table__row--editing td:nth-child(4) { display: block; }
  .page-table .cms-table td:nth-child(5),
  .page-table .cms-table td:nth-child(7) { display: none; }
  .page-table .cms-table td:nth-child(6) { grid-area: status; justify-self: end; }
  .page-table .cms-table td:nth-child(8) {
    position: static;
    grid-area: actions;
    align-self: start;
    background: transparent;
    box-shadow: none;
  }

  .page-table .cms-table code {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .page-table .cms-table td:nth-child(6) > div {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .page-table .row-actions__menu {
    position: fixed;
    top: auto;
    right: 1.2rem;
    left: 1.2rem;
    width: auto;
  }
}

.cms-form-required {
  color: #c0392b;
  margin-left: 0.2rem;
}
</style>
