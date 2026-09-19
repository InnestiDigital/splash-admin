<template>
  <AdminPageHeader :title="t('admin.nav.articles', 'Articles')" alert-context="articles" />

  <!-- Toolbar: New article + filters --------------------------------- -->
  <div class="article-list__toolbar">
    <div class="article-list__filters">
      <div class="cms-form-group mb-0">
        <label class="cms-label">{{ t('admin.collections.blog', 'Blog') }}</label>
        <select
          v-model="blogFilter"
          class="cms-form-control"
          style="width: 22rem;"
        >
          <option value="">{{ t('admin.collections.allBlogs', 'All blogs') }}</option>
          <option v-for="b in blogOptions" :key="b.id" :value="b.id">
            {{ b.title }}
          </option>
        </select>
      </div>

      <div class="cms-form-group mb-0">
        <label class="cms-label">{{ t('admin.collections.status', 'Status') }}</label>
        <div class="article-list__chips">
          <button
            v-for="opt in STATUS_OPTIONS"
            :key="opt.value"
            type="button"
            class="article-list__chip"
            :class="{ 'article-list__chip--active': statusFilter === opt.value }"
            @click="statusFilter = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <div class="cms-form-group mb-0" style="flex: 1; min-width: 18rem;">
        <label class="cms-label">{{ t('admin.collections.search', 'Search') }}</label>
        <input
          v-model.trim="searchInput"
          type="text"
          class="cms-form-control"
          :placeholder="t('admin.collections.searchTitle', 'Search by title...')"
        />
      </div>
    </div>

    <button
      class="cms-btn cms-btn--primary"
      @click="navigateTo(adminUrl('/articles/new'))"
    >
      <span class="material-icons-outlined" style="font-size: 1.6rem; vertical-align: middle; margin-right: 0.4rem;">add</span>
      {{ t('admin.nav.newArticle', 'New article') }}
    </button>
  </div>

  <!-- Loading -->
  <UiAsyncState v-if="loading" type="loading" :title="t('admin.collections.loadingArticles', 'Loading articles')" />

  <!-- Error -->
  <div v-else-if="error" class="cms-alert cms-alert--danger">
    <span class="material-icons-outlined cms-alert-icon">error</span>
    <div class="cms-alert-content">
      <div class="cms-alert-title">{{ t('admin.collections.articlesFailed', 'Failed to load articles') }}</div>
      <div class="cms-alert-description">{{ error }}</div>
    </div>
    <button class="cms-btn cms-btn--secondary cms-btn--sm" @click="fetchArticles">
      {{ t('admin.shell.retry', 'Retry') }}
    </button>
  </div>

  <!-- Empty -->
  <UiEmptyState v-else-if="articles.length === 0" size="page" icon="newspaper" :title="t('admin.collections.noArticles', 'No articles match this view')" :description="t('admin.collections.articlesEmptyDescription', 'Clear the filters or create an article to start publishing.')" />

  <!-- Table -->
  <template v-else>
    <div class="cms-table-wrapper">
      <table class="cms-table">
        <thead>
          <tr>
            <th>{{ t('admin.collections.title', 'Title') }}</th>
            <th>{{ t('admin.collections.blog', 'Blog') }}</th>
            <th>{{ t('admin.collections.template', 'Template') }}</th>
            <th>{{ t('admin.collections.author', 'Author') }}</th>
            <th>{{ t('admin.collections.updated', 'Updated') }}</th>
            <th>{{ t('admin.collections.status', 'Status') }}</th>
            <th class="text-end">{{ t('admin.collections.actions', 'Actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="article in articles" :key="article.id">
            <td>
              <NuxtLink
                :to="adminUrl(`/articles/${article.id}`)"
                class="article-list__title-link"
              >
                {{ article.title || article.slug }}
              </NuxtLink>
              <code class="article-list__slug">/{{ article.slug }}</code>
            </td>
            <td>{{ article.parentTitle ?? '—' }}</td>
            <td>
              <span v-if="article.templateName">
                {{ article.templateName }}
              </span>
              <span v-else class="text-muted">—</span>
            </td>
            <td>{{ article.authorName ?? '—' }}</td>
            <td>
              <time :datetime="article.updatedAt">{{ formatRelativeDate(article.updatedAt) }}</time>
            </td>
            <td>
              <StatusPill :status="article.publishedAt ? 'published' : 'draft'" />
            </td>
            <td class="text-end">
              <NuxtLink
                :to="adminUrl(`/articles/${article.id}`)"
                class="cms-btn cms-btn--secondary cms-btn--sm"
              >
                {{ t('common.edit', 'Edit') }}
              </NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { computed, onMounted, ref, watch } from 'vue'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import { useSite } from '~/admin/composables/useSite'
import { useSiteApi } from '~/admin/composables/useSiteApi'
import { formatRelativeDate } from '~/admin/utils/formatters'
import StatusPill from '~/admin/components/pageSettings/StatusPill.vue'
import UiAsyncState from '~/admin/components/ui/UiAsyncState.vue'
import UiEmptyState from '~/admin/components/ui/UiEmptyState.vue'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

interface AdminArticleListItem {
  id: string
  title: string
  slug: string
  locale: string
  parentId: string | null
  parentTitle: string | null
  templateId: string | null
  templateName: string | null
  templateAppliesTo: 'static' | 'blog-index' | 'article' | null
  publishedAt: string | null
  updatedAt: string
  authorUserId: string | null
  authorName: string | null
  pageType: 'article'
}

type StatusFilter = '' | 'draft' | 'published'

const STATUS_OPTIONS = computed<Array<{ value: StatusFilter; label: string }>>(() => [
  { value: '', label: t('admin.collections.all', 'All') },
  { value: 'draft', label: t('admin.pages.draft', 'Draft') },
  { value: 'published', label: t('admin.pages.published', 'Published') },
])

const { adminUrl } = useAdminUrl()
const { siteId, hasSite } = useSite()
const { siteFetch } = useSiteApi()

const articles = ref<AdminArticleListItem[]>([])
const loading = ref(true)
const error = ref('')

const blogFilter = ref<string>('')
const statusFilter = ref<StatusFilter>('')

// Debounced search input → query value used for fetching.
const searchInput = ref('')
const searchQuery = ref('')
let searchDebounce: ReturnType<typeof setTimeout> | null = null

watch(searchInput, (next) => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    searchQuery.value = next
  }, 300)
})

// Derive blog options from the article list itself. TODO(2.E.1): replace with
// a dedicated /blogs admin endpoint once it ships so the dropdown shows blogs
// that have zero articles too.
const blogOptions = computed<Array<{ id: string; title: string }>>(() => {
  const seen = new Map<string, string>()
  for (const a of articles.value) {
    if (a.parentId && !seen.has(a.parentId)) {
      seen.set(a.parentId, a.parentTitle ?? a.parentId)
    }
  }
  return Array.from(seen.entries())
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.localeCompare(b.title))
})

onMounted(() => {
  if (hasSite.value) fetchArticles()
})

watch(siteId, (id) => {
  if (id) fetchArticles()
})

watch([blogFilter, statusFilter, searchQuery], () => {
  if (hasSite.value) fetchArticles()
})

async function fetchArticles() {
  if (!hasSite.value) return
  loading.value = true
  error.value = ''
  try {
    const params: Record<string, string> = {}
    if (blogFilter.value) params.blogId = blogFilter.value
    if (statusFilter.value) params.status = statusFilter.value
    if (searchQuery.value) params.q = searchQuery.value
    const data = await siteFetch<{ articles: AdminArticleListItem[] }>(
      '/articles',
      { params },
    )
    articles.value = data.articles ?? []
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Failed to load articles'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.article-list__toolbar {
  display: flex;
  align-items: flex-end;
  gap: 1.5rem;
  flex-wrap: wrap;
  margin-bottom: 1.6rem;
}

.article-list__filters {
  display: flex;
  align-items: flex-end;
  gap: 1.2rem;
  flex-wrap: wrap;
  flex: 1;
}

.article-list__chips {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.article-list__chip {
  border: 1px solid var(--cms-line);
  background: var(--cms-surface);
  color: var(--cms-ink-body);
  padding: 0.5rem 1.1rem;
  font-size: 1.2rem;
  border-radius: 0.2rem;
  cursor: pointer;
}
.article-list__chip:hover {
  background: var(--cms-surface-subtle);
}
.article-list__chip--active {
  background: var(--cms-ink);
  border-color: var(--cms-ink-body);
  color: var(--cms-ink-inverse);
}
.article-list__chip--active:hover {
  background: var(--cms-ink);
}

.article-list__title-link {
  font-weight: 500;
  color: var(--cms-ink-body);
  text-decoration: none;
}
.article-list__title-link:hover {
  text-decoration: underline;
}

.article-list__slug {
  display: block;
  font-size: 1.1rem;
  color: var(--cms-ink-subtle);
  margin-top: 0.2rem;
}
</style>
