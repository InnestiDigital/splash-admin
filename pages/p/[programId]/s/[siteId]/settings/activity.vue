<template>
  <AdminPageHeader
    :title="t('admin.activity.title', 'Activity log')"
    :description="t('admin.activity.description', 'Review important changes made across this website.')"
    alert-context="audit"
  />

  <!-- Filters -->
  <div class="d-flex align-items-end gap-3 mb-4 flex-wrap">
    <div class="cms-form-group mb-0">
      <label class="cms-label">{{ t('admin.activity.action', 'Action') }}</label>
      <select v-model="actionFilter" class="cms-form-control" style="width: 20rem;" @change="resetAndFetch">
        <option value="">{{ t('admin.activity.allActions', 'All actions') }}</option>
        <option v-for="action in knownActions" :key="action" :value="action">
          {{ action }}
        </option>
      </select>
    </div>
    <div class="cms-form-group mb-0">
      <label class="cms-label">{{ t('admin.activity.user', 'User') }}</label>
      <input
        v-model.trim="emailFilter"
        class="cms-form-control"
        style="width: 20rem;"
        placeholder="Filter by email..."
        @keyup.enter="resetAndFetch"
        @blur="resetAndFetch"
      />
    </div>
    <div class="cms-form-group mb-0">
      <label class="cms-label">{{ t('admin.activity.from', 'From') }}</label>
      <input v-model="dateFrom" type="date" class="cms-form-control" style="width: 16rem;" @change="resetAndFetch" />
    </div>
    <div class="cms-form-group mb-0">
      <label class="cms-label">{{ t('admin.activity.to', 'To') }}</label>
      <input v-model="dateTo" type="date" class="cms-form-control" style="width: 16rem;" @change="resetAndFetch" />
    </div>
    <div class="cms-form-group mb-0">
      <label class="cms-label">{{ t('admin.activity.perPage', 'Per page') }}</label>
      <select v-model.number="limit" class="cms-form-control" style="width: 10rem;" @change="resetAndFetch">
        <option :value="50">50</option>
        <option :value="100">100</option>
        <option :value="200">200</option>
      </select>
    </div>
  </div>

  <!-- Loading -->
  <div v-if="loading" class="text-center py-5">
    <span class="cms-spinner cms-spinner--lg" />
  </div>

  <!-- Error -->
  <div v-else-if="error" class="cms-alert cms-alert--danger">
    <span class="material-icons-outlined cms-alert-icon">error</span>
    <div class="cms-alert-content">
      <div class="cms-alert-title">{{ t('admin.activity.loadFailed', 'Failed to load activity log') }}</div>
      <div class="cms-alert-description">{{ error }}</div>
    </div>
  </div>

  <!-- Empty -->
  <div v-else-if="entries.length === 0" class="text-center py-5">
    <p class="text-muted" style="font-size: 1.5rem;">{{ t('admin.activity.empty', 'No activity entries found.') }}</p>
  </div>

  <!-- Audit table -->
  <template v-else>
    <div class="cms-table-wrapper">
      <table class="cms-table">
        <thead>
          <tr>
            <th style="width: 2rem;"><span class="visually-hidden">{{ t('admin.activity.details', 'Details') }}</span></th>
            <th>{{ t('admin.activity.dateTime', 'Date/time') }}</th>
            <th>{{ t('admin.activity.user', 'User') }}</th>
            <th>{{ t('admin.activity.action', 'Action') }}</th>
            <th>{{ t('admin.activity.resource', 'Resource') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(entry, index) in entries" :key="index">
            <tr :class="{ 'audit-row--expandable': entry.hasDetails }">
              <td>
                <button
                  v-if="entry.hasDetails"
                  type="button"
                  class="audit-detail-toggle"
                  :aria-label="`${expandedIndex === index ? 'Hide' : 'Show'} details for ${entry.action}`"
                  :aria-expanded="expandedIndex === index"
                  :aria-controls="`audit-detail-${index}`"
                  @click="toggleDetail(index)"
                ><span class="material-icons-outlined" aria-hidden="true">{{ expandedIndex === index ? 'expand_less' : 'expand_more' }}</span></button>
              </td>
              <td>{{ formatDateTime(entry.timestamp) }}</td>
              <td>{{ entry.email || entry.userId }}</td>
              <td><code>{{ entry.action }}</code></td>
              <td>{{ entry.resource }}</td>
            </tr>
            <tr v-if="expandedIndex === index && entry.hasDetails" :id="`audit-detail-${index}`" class="audit-detail-row">
              <td></td>
              <td colspan="4">
                <pre class="audit-detail-json">{{ JSON.stringify(detailCache.get(entry.id!), null, 2) }}</pre>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="d-flex align-items-center justify-content-between mt-3">
      <span class="text-muted" style="font-size: 1.3rem;">
        Showing {{ offset + 1 }}–{{ Math.min(offset + limit, total) }} of {{ total }}
      </span>
      <div class="d-flex gap-2">
        <button class="cms-btn cms-btn--sm cms-btn--outline" :disabled="currentPage <= 1 || isLoading" @click="goToPage(currentPage - 1)">
          Previous
        </button>
        <button class="cms-btn cms-btn--sm cms-btn--outline" :disabled="currentPage >= totalPages || isLoading" @click="goToPage(currentPage + 1)">
          Next
        </button>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { useSite } from '~/admin/composables/useSite'
import { useSiteApi } from '~/admin/composables/useSiteApi'
import type { AuditEntry } from '~/server/storage/types'
import { formatDateTime } from '~/admin/utils/formatters'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

const { siteId, hasSite } = useSite()
const { siteFetch } = useSiteApi()

const entries = ref<AuditEntry[]>([])
const total = ref(0)
const loading = ref(true)
const isLoading = ref(false)
const error = ref('')
const limit = ref(100)
const offset = ref(0)
const actionFilter = ref('')
const emailFilter = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const expandedIndex = ref<number | null>(null)
const detailCache = new Map<number, Record<string, any>>()

const knownActions = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

const currentPage = computed(() => Math.floor(offset.value / limit.value) + 1)
const totalPages = computed(() => Math.ceil(total.value / limit.value))

onMounted(async () => {
  if (hasSite.value) await fetchEntries()
})

watch(siteId, (newId) => {
  if (newId) {
    offset.value = 0
    fetchEntries()
  }
})

function resetAndFetch() {
  offset.value = 0
  expandedIndex.value = null
  detailCache.clear()
  fetchEntries()
}

function goToPage(page: number) {
  offset.value = (page - 1) * limit.value
  expandedIndex.value = null
  detailCache.clear()
  fetchEntries()
}

async function fetchEntries() {
  if (!hasSite.value) return
  if (isLoading.value) return
  isLoading.value = true
  loading.value = true
  error.value = ''
  try {
    const params: Record<string, string | number> = {
      limit: limit.value,
      offset: offset.value,
    }
    if (actionFilter.value) params.action = actionFilter.value
    if (emailFilter.value) params.email = emailFilter.value
    if (dateFrom.value) params.dateFrom = dateFrom.value
    if (dateTo.value) params.dateTo = dateTo.value

    const data = await siteFetch<{ entries: AuditEntry[]; total: number }>(
      '/audit',
      { params }
    )
    entries.value = data.entries || []
    total.value = data.total ?? 0
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Failed to load audit log'
  } finally {
    loading.value = false
    isLoading.value = false
  }
}

async function toggleDetail(index: number) {
  const entry = entries.value[index]
  if (!entry.hasDetails) return
  if (expandedIndex.value === index) {
    expandedIndex.value = null
    return
  }
  if (entry.id && !detailCache.has(entry.id)) {
    const data = await siteFetch<{ details: Record<string, any> }>(
      `/audit/${entry.id}`
    )
    detailCache.set(entry.id, data.details)
    entry.details = data.details
  }
  expandedIndex.value = index
}

</script>

<style scoped>
.audit-detail-toggle {
  display: grid;
  width: 3.2rem;
  height: 3.2rem;
  padding: 0;
  place-items: center;
  color: var(--cms-ink-muted);
  border: 0;
  border-radius: var(--cms-radius-control);
  background: transparent;
  cursor: pointer;
}
.audit-detail-toggle:hover { color: var(--cms-ink); background: var(--cms-surface-subtle); }
.audit-detail-toggle .material-icons-outlined { font-size: 1.8rem; }
.audit-detail-row td {
  padding-top: 0 !important;
  padding-bottom: 1.5rem !important;
  border-bottom: 1px solid var(--cms-line);
}
.audit-detail-json {
  background: var(--cms-surface-subtle);
  border: 1px solid var(--cms-line);
  border-radius: 0.2rem;
  padding: 1rem 1.5rem;
  font-size: 1.2rem;
  font-family: monospace;
  overflow-x: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
