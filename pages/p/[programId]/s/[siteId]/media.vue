<template>
  <AdminPageHeader
    :title="t('admin.media.title', 'Media')"
    :description="t('admin.media.description', 'Upload and reuse images, videos, and files across this website.')"
    alert-context="media"
  >
    <template #actions>
      <button
        class="cms-btn cms-btn--primary"
        :disabled="uploading"
        @click="fileInput?.click()"
      >
        <span v-if="uploading" class="cms-btn-spinner" />
        <span v-else class="material-icons-outlined" aria-hidden="true">upload</span>
        {{ uploading ? 'Uploading…' : 'Upload media' }}
      </button>
    </template>
  </AdminPageHeader>

  <input
    ref="fileInput"
    type="file"
    multiple
    accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
    style="display: none;"
    @change="handleFileSelect"
  />

  <!-- Quota bar -->
  <div v-if="quotaBytes > 0" class="mb-3">
    <small class="text-muted">
      {{ formatMb(usedBytes) }} MB of {{ formatMb(quotaBytes) }} MB used
    </small>
    <div class="progress" style="height: 6px;">
      <div
        class="progress-bar"
        :class="{
          'bg-warning': quotaPct >= 80 && quotaPct < 95,
          'bg-danger':  quotaPct >= 95,
        }"
        :style="{ width: Math.min(quotaPct, 100) + '%' }"
      />
    </div>
  </div>

  <!-- Toolbar -->
  <div class="d-flex align-items-end gap-3 mb-4 flex-wrap">
    <div class="cms-form-group mb-0" style="flex: 1; max-width: 30rem;">
      <label class="cms-label">{{ t('admin.media.search', 'Search') }}</label>
      <input
        v-model="searchQuery"
        type="text"
        class="cms-form-control"
        :placeholder="t('admin.media.searchPlaceholder', 'Search by filename...')"
      />
    </div>
  </div>

  <!-- Upload progress -->
  <div v-if="uploading" class="cms-alert cms-alert--warning mb-3">
    <span class="material-icons-outlined cms-alert-icon">cloud_upload</span>
    <div class="cms-alert-content">
      <div class="cms-alert-title">{{ t('admin.media.uploading', 'Uploading…') }}</div>
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
      <div class="cms-alert-title">{{ t('admin.media.loadFailed', 'Failed to load media') }}</div>
      <div class="cms-alert-description">{{ error }}</div>
    </div>
  </div>

  <!-- Empty -->
  <div v-else-if="items.length === 0" class="cms-empty">
    <span class="material-icons-outlined cms-empty__icon">perm_media</span>
    <p class="cms-empty__title">
      {{ searchQuery ? 'No media matches that search' : 'No media yet' }}
    </p>
    <p class="cms-empty__body">
      {{ searchQuery
        ? 'Try a different filename, or clear the search to see everything.'
        : 'Upload images, videos and files here to reuse them across this website.' }}
    </p>
  </div>

  <!-- Media grid -->
  <template v-else>
    <div class="media-grid">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="media-card"
        @click="selectItem(item)"
      >
        <div class="media-card__thumb">
          <template v-if="isVideo(item)">
            <video :src="item.url" preload="metadata" muted playsinline></video>
            <span class="media-card__play" aria-hidden="true">&#9654;</span>
          </template>
          <img v-else :src="item.url" :alt="item.filename" loading="lazy" />
        </div>
        <div class="media-card__info">
          <span class="media-card__name" :title="item.filename">{{ item.filename }}</span>
          <span class="media-card__meta">{{ formatSize(item.size) }}</span>
        </div>
      </button>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="cms-table-pagination">
      <span class="page-info">Page {{ page }} of {{ totalPages }} ({{ total }} items)</span>
      <button
        class="page-btn"
        :disabled="page <= 1 || isLoading"
        @click="goToPage(page - 1)"
      >
        Prev
      </button>
      <button
        class="page-btn"
        :disabled="page >= totalPages || isLoading"
        @click="goToPage(page + 1)"
      >
        Next
      </button>
    </div>
  </template>

  <!-- Detail overlay -->
  <div v-if="selectedItem" class="media-overlay" @click.self="selectedItem = null">
    <div class="media-overlay__panel">
      <div class="media-overlay__header">
        <h3>{{ selectedItem.filename }}</h3>
        <button class="media-overlay__close" @click="selectedItem = null">&times;</button>
      </div>
      <div class="media-overlay__preview">
        <video v-if="isVideo(selectedItem)" :src="selectedItem.url" controls preload="metadata"></video>
        <img v-else :src="selectedItem.url" :alt="selectedItem.filename" />
      </div>
      <div class="media-overlay__details">
        <div class="cms-form-group">
          <label class="cms-label">{{ t('admin.media.url', 'URL') }}</label>
          <div class="d-flex gap-2">
            <input
              :value="selectedItem.url"
              type="text"
              class="cms-form-control"
              readonly
            />
            <button class="cms-btn cms-btn--secondary cms-btn--sm" @click="copyUrl(selectedItem!.url)">
              Copy
            </button>
          </div>
        </div>
        <p class="text-muted" style="font-size: 1.2rem;">
          {{ formatSize(selectedItem.size) }} &middot; {{ selectedItem.contentType }} &middot; {{ formatDate(selectedItem.createdAt) }}
        </p>
      </div>
      <div class="media-overlay__actions">
        <button
          class="cms-btn cms-btn--danger-quiet cms-btn--sm"
          :disabled="deleting"
          @click="confirmDelete(selectedItem!)"
        >
          {{ deleting ? 'Deleting...' : 'Delete' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { useAlertStore } from '~/admin/stores/alertStore'
import { useSite } from '~/admin/composables/useSite'
import { useSiteApi } from '~/admin/composables/useSiteApi'
import type { MediaRecord, MediaPage } from '~/server/storage/types'
import { formatDate, formatSize } from '~/admin/utils/formatters'
import { useConfirmAction } from '~/admin/composables/useConfirmAction'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

const { siteId, hasSite } = useSite()
const { siteFetch } = useSiteApi()
const alertStore = useAlertStore()
const confirmAction = useConfirmAction()

const items = ref<MediaRecord[]>([])
const loading = ref(true)
const isLoading = ref(false)
const error = ref('')
const searchQuery = ref('')
const page = ref(1)
const perPage = 20
const total = ref(0)
const totalPages = ref(0)
const uploading = ref(false)
const deleting = ref(false)
const selectedItem = ref<MediaRecord | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const usedBytes = ref(0)
const quotaBytes = ref(0)
const quotaPct = computed(() => quotaBytes.value > 0 ? Math.round((usedBytes.value / quotaBytes.value) * 100) : 0)

function formatMb(bytes: number): number {
  return Math.round(bytes / 1024 / 1024)
}

function isVideo(item: MediaRecord): boolean {
  return typeof item.contentType === 'string' && item.contentType.startsWith('video/')
}

const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const VIDEO_MAX_BYTES = 100 * 1024 * 1024

let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    fetchMedia()
  }, 300)
})

onBeforeUnmount(() => {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
})

onMounted(async () => {
  if (hasSite.value) await fetchMedia()
})

watch(siteId, (newId) => {
  if (newId) fetchMedia()
})

async function fetchMedia() {
  if (!hasSite.value) return
  if (isLoading.value) return
  isLoading.value = true
  loading.value = true
  error.value = ''
  try {
    const data = await siteFetch<MediaPage>(
      '/media',
      {
        params: {
          search: searchQuery.value || undefined,
          page: page.value,
          perPage,
        },
      }
    )
    items.value = data.items || []
    total.value = data.total || 0
    totalPages.value = Math.ceil((data.total || 0) / perPage)
    usedBytes.value = data.usedBytes ?? 0
    quotaBytes.value = data.quotaBytes ?? 0
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Failed to load media'
  } finally {
    loading.value = false
    isLoading.value = false
  }
}

function goToPage(p: number) {
  page.value = p
  fetchMedia()
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  if (files.length === 0) return

  uploading.value = true
  alertStore.clearContext('media')

  let uploadedCount = 0
  const failures: string[] = []

  for (const file of files) {
    // Validate size per kind (images 5MB, video 100MB — mirrors the server ceiling).
    const isVideoFile = file.type.startsWith('video/')
    const maxBytes = isVideoFile ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES
    if (file.size > maxBytes) {
      failures.push(`${file.name} (over ${Math.round(maxBytes / 1024 / 1024)}MB)`)
      continue
    }

    try {
      const formData = new FormData()
      formData.append('file', file)
      await siteFetch<MediaRecord>(
        '/media/upload',
        { method: 'POST', body: formData }
      )
      uploadedCount += 1
    } catch (e: any) {
      failures.push(`${file.name} (${e?.data?.statusMessage || 'upload failed'})`)
    }
  }

  if (uploadedCount > 0) {
    alertStore.success(
      uploadedCount === 1 ? 'Image uploaded.' : `${uploadedCount} files uploaded.`,
      undefined,
      'media'
    )
  }
  if (failures.length > 0) {
    alertStore.danger(
      uploadedCount > 0 ? 'Some files failed to upload.' : 'Upload failed.',
      failures.join(', '),
      'media'
    )
  }

  if (uploadedCount > 0) await fetchMedia()

  uploading.value = false
  input.value = ''
}

function selectItem(item: MediaRecord) {
  selectedItem.value = item
}

function copyUrl(url: string) {
  navigator.clipboard.writeText(url)
  alertStore.success('URL copied to clipboard.', undefined, 'media')
}

async function confirmDelete(item: MediaRecord) {
  const accepted = await confirmAction.confirm({
    title: `Delete ${item.filename}?`,
    description: 'This permanently removes the file. Any content that uses its URL may show a broken image or link.',
    confirmLabel: 'Delete file',
    tone: 'danger',
  })
  if (!accepted) return
  doDelete(item)
}

async function doDelete(item: MediaRecord) {
  deleting.value = true
  alertStore.clearContext('media')
  try {
    await siteFetch(`/media/${item.id}`, {
      method: 'DELETE',
    })
    selectedItem.value = null
    alertStore.success('Image deleted.', undefined, 'media')
    await fetchMedia()
  } catch (e: any) {
    alertStore.danger(
      'Delete failed.',
      e?.data?.statusMessage || 'Could not delete the file.',
      'media'
    )
  } finally {
    deleting.value = false
  }
}

</script>

<style scoped>
.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
  gap: 1.5rem;
}

.media-card {
  width: 100%;
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  border: 1px solid var(--cms-line);
  background: var(--cms-surface);
  border-radius: 0.2rem;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.media-card:hover {
  border-color: var(--cms-accent);
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.media-card__thumb {
  aspect-ratio: 4/3;
  background: var(--cms-surface-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.media-card__thumb {
  position: relative;
}
.media-card__thumb img,
.media-card__thumb video {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.media-card__play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  color: var(--cms-ink-inverse);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
  pointer-events: none;
}

.media-card__info {
  padding: 0.8rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.media-card__name {
  font-size: 1.2rem;
  font-weight: 500;
  color: var(--cms-ink-body);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.media-card__meta {
  font-size: 1.1rem;
  color: var(--cms-ink-subtle);
}

/* Detail overlay */
.media-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}
.media-overlay__panel {
  background: var(--cms-surface);
  border-radius: 0.4rem;
  width: 100%;
  max-width: 60rem;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}
.media-overlay__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem 2rem;
  border-bottom: 1px solid var(--cms-line);
}
.media-overlay__header h3 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
  word-break: break-all;
}
.media-overlay__close {
  background: none;
  border: none;
  font-size: 2.4rem;
  cursor: pointer;
  color: var(--cms-ink-subtle);
  line-height: 1;
  padding: 0;
}
.media-overlay__close:hover {
  color: var(--cms-ink-body);
}
.media-overlay__preview {
  padding: 2rem;
  background: var(--cms-surface-subtle);
  text-align: center;
}
.media-overlay__preview img,
.media-overlay__preview video {
  max-width: 100%;
  max-height: 40rem;
  object-fit: contain;
}
.media-overlay__details {
  padding: 1.5rem 2rem;
}
.media-overlay__actions {
  padding: 0 2rem 1.5rem;
  display: flex;
  justify-content: flex-end;
}
</style>
