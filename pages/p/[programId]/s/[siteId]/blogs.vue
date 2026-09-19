<template>
  <AdminPageHeader :title="t('admin.nav.blogs', 'Blogs')" alert-context="blogs" />

  <!-- Toolbar: New blog + filters --------------------------------- -->
  <div class="blog-list__toolbar">
    <div class="blog-list__filters">
      <div class="cms-form-group mb-0">
        <label class="cms-label">{{ t('admin.collections.status', 'Status') }}</label>
        <div class="blog-list__chips">
          <button
            v-for="opt in STATUS_OPTIONS"
            :key="opt.value"
            type="button"
            class="blog-list__chip"
            :class="{ 'blog-list__chip--active': statusFilter === opt.value }"
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
      @click="navigateTo(adminUrl('/blogs/new'))"
    >
      <span class="material-icons-outlined" style="font-size: 1.6rem; vertical-align: middle; margin-right: 0.4rem;">add</span>
      {{ t('admin.nav.newBlog', 'New blog') }}
    </button>
  </div>

  <!-- Loading -->
  <UiAsyncState v-if="loading" type="loading" :title="t('admin.collections.loadingBlogs', 'Loading blogs')" />

  <!-- Error -->
  <div v-else-if="error" class="cms-alert cms-alert--danger">
    <span class="material-icons-outlined cms-alert-icon">error</span>
    <div class="cms-alert-content">
      <div class="cms-alert-title">{{ t('admin.collections.blogsFailed', 'Failed to load blogs') }}</div>
      <div class="cms-alert-description">{{ error }}</div>
    </div>
    <button class="cms-btn cms-btn--secondary cms-btn--sm" @click="fetchBlogs">
      {{ t('admin.shell.retry', 'Retry') }}
    </button>
  </div>

  <!-- Empty -->
  <UiEmptyState v-else-if="blogs.length === 0" size="page" icon="feed" :title="t('admin.collections.noBlogs', 'No blogs match this view')" :description="t('admin.collections.blogsEmptyDescription', 'Clear the filters or create a blog to start publishing articles.')" />

  <!-- Table -->
  <template v-else>
    <div class="cms-table-wrapper">
      <table class="cms-table">
        <thead>
          <tr>
            <th>{{ t('admin.collections.title', 'Title') }}</th>
            <th>{{ t('admin.collections.template', 'Template') }}</th>
            <th>{{ t('admin.collections.articles', 'Articles') }}</th>
            <th>{{ t('admin.collections.updated', 'Updated') }}</th>
            <th>{{ t('admin.collections.status', 'Status') }}</th>
            <th class="text-end">{{ t('admin.collections.actions', 'Actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="blog in blogs" :key="blog.id">
            <td>
              <NuxtLink
                :to="adminUrl(`/blogs/${blog.id}`)"
                class="blog-list__title-link"
              >
                {{ blog.title || blog.slug }}
              </NuxtLink>
              <code class="blog-list__slug">/{{ blog.slug }}</code>
            </td>
            <td>
              <span v-if="blog.templateName">
                {{ blog.templateName }}
              </span>
              <span v-else class="text-muted">—</span>
            </td>
            <td>
              <span class="blog-list__count-badge" :data-count="blog.articleCount">
                {{ blog.articleCount }}
              </span>
            </td>
            <td>
              <time :datetime="blog.updatedAt">{{ formatRelativeDate(blog.updatedAt) }}</time>
            </td>
            <td>
              <StatusPill :status="blog.publishedAt ? 'published' : 'draft'" />
            </td>
            <td class="text-end">
              <NuxtLink
                :to="adminUrl(`/blogs/${blog.id}`)"
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

interface AdminBlogListItem {
  id: string
  title: string
  slug: string
  locale: string
  templateId: string | null
  templateName: string | null
  templateAppliesTo: 'static' | 'blog-index' | 'article' | null
  publishedAt: string | null
  updatedAt: string
  pageType: 'blog-index'
  articleCount: number
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

const blogs = ref<AdminBlogListItem[]>([])
const loading = ref(true)
const error = ref('')

const statusFilter = ref<StatusFilter>('')

const searchInput = ref('')
const searchQuery = ref('')
let searchDebounce: ReturnType<typeof setTimeout> | null = null

watch(searchInput, (next) => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    searchQuery.value = next
  }, 300)
})

onMounted(() => {
  if (hasSite.value) fetchBlogs()
})

watch(siteId, (id) => {
  if (id) fetchBlogs()
})

watch([statusFilter, searchQuery], () => {
  if (hasSite.value) fetchBlogs()
})

async function fetchBlogs() {
  if (!hasSite.value) return
  loading.value = true
  error.value = ''
  try {
    const params: Record<string, string> = {}
    if (statusFilter.value) params.status = statusFilter.value
    if (searchQuery.value) params.q = searchQuery.value
    const data = await siteFetch<{ blogs: AdminBlogListItem[] }>(
      '/blogs',
      { params },
    )
    blogs.value = data.blogs ?? []
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Failed to load blogs'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.blog-list__toolbar {
  display: flex;
  align-items: flex-end;
  gap: 1.5rem;
  flex-wrap: wrap;
  margin-bottom: 1.6rem;
}

.blog-list__filters {
  display: flex;
  align-items: flex-end;
  gap: 1.2rem;
  flex-wrap: wrap;
  flex: 1;
}

.blog-list__chips {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.blog-list__chip {
  border: 1px solid var(--cms-line);
  background: var(--cms-surface);
  color: var(--cms-ink-body);
  padding: 0.5rem 1.1rem;
  font-size: 1.2rem;
  border-radius: 0.2rem;
  cursor: pointer;
}
.blog-list__chip:hover {
  background: var(--cms-surface-subtle);
}
.blog-list__chip--active {
  background: var(--cms-ink);
  border-color: var(--cms-ink-body);
  color: var(--cms-ink-inverse);
}
.blog-list__chip--active:hover {
  background: var(--cms-ink);
}

.blog-list__title-link {
  font-weight: 500;
  color: var(--cms-ink-body);
  text-decoration: none;
}
.blog-list__title-link:hover {
  text-decoration: underline;
}

.blog-list__slug {
  display: block;
  font-size: 1.1rem;
  color: var(--cms-ink-subtle);
  margin-top: 0.2rem;
}

.blog-list__count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.4rem;
  padding: 0.2rem 0.6rem;
  background: var(--cms-accent-soft);
  color: var(--cms-accent);
  border-radius: 1rem;
  font-size: 1.2rem;
  font-weight: 500;
}
.blog-list__count-badge[data-count="0"] {
  background: var(--cms-surface-subtle);
  color: var(--cms-ink-subtle);
}
</style>
