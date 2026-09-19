<template>
  <div v-if="open" class="media-browser__overlay" @click.self="onCancel">
    <div
      ref="dialogEl"
      class="media-browser__modal"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
    >
      <div class="media-browser__header">
        <h3 :id="titleId">{{ modalTitle }}</h3>
        <button
          type="button"
          class="media-browser__close"
          aria-label="Close"
          @click="onCancel"
        >&times;</button>
      </div>
      <div class="media-browser__body">
        <div class="media-browser__search">
          <input
            ref="searchEl"
            v-model="searchQuery"
            type="text"
            aria-label="Search media"
            placeholder="Search media..."
            data-media-browser-search
            @input="debouncedSearch"
          />
        </div>
        <div v-if="loading" class="media-browser__loading">Loading media...</div>
        <div v-else-if="mediaItems.length > 0" class="media-browser__grid">
          <button
            v-for="item in mediaItems"
            :key="item.id"
            type="button"
            class="media-browser__grid-item"
            :class="{ 'media-browser__grid-item--selected': selectedMedia?.id === item.id }"
            data-media-browser-item
            @click="selectMedia(item)"
          >
            <template v-if="isVideo(item)">
              <video
                :src="item.url"
                class="media-browser__video"
                preload="metadata"
                muted
                playsinline
              ></video>
              <span class="media-browser__play" aria-hidden="true">&#9654;</span>
            </template>
            <img v-else :src="item.url" :alt="item.filename" />
          </button>
        </div>
        <div v-else class="media-browser__empty">No media found.</div>
      </div>
      <div class="media-browser__footer">
        <!-- A <label> wrapping the input is not focusable, so the upload control
             was unreachable by keyboard. A real button owns the click instead. -->
        <button
          type="button"
          class="media-browser__btn media-browser__btn--secondary"
          :disabled="uploading"
          :aria-busy="uploading || undefined"
          @click="uploadEl?.click()"
        >{{ uploading ? 'Uploading…' : 'Upload New' }}</button>
        <input
          ref="uploadEl"
          type="file"
          :accept="accept"
          :disabled="uploading"
          data-media-browser-upload
          hidden
          @change="handleUpload"
        />
        <div class="media-browser__footer-spacer" />
        <button
          type="button"
          class="media-browser__btn media-browser__btn--secondary"
          data-media-browser-cancel
          @click="onCancel"
        >Cancel</button>
        <button
          type="button"
          class="media-browser__btn media-browser__btn--primary"
          :disabled="!selectedMedia"
          data-media-browser-confirm
          @click="confirmSelection"
        >Select</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, toRef, useId, watch, onBeforeUnmount } from 'vue'
import { getCsrfToken } from '~/admin/utils/csrf'
import { useModalDialog } from '~/admin/composables/useModalDialog'
import type { MediaRecord, MediaPage } from '~/server/storage/types'
import type { MediaUploadHandler } from './mediaUpload'

interface Props {
  open: boolean
  siteId: string
  title?: string
  /** File input accept attribute. */
  accept?: string
  /** Which kind of media to browse. 'all' shows everything (no server filter). */
  mediaType?: 'image' | 'video' | 'all'
  /** Optional owner-managed upload. The handler commits selection explicitly. */
  uploadHandler?: MediaUploadHandler
}

const props = withDefaults(defineProps<Props>(), {
  accept: 'image/*',
  mediaType: 'image',
})

const modalTitle = computed(() =>
  props.title ?? (props.mediaType === 'video' ? 'Select Video' : 'Select Image'),
)

function isVideo(item: MediaRecord): boolean {
  return typeof item.contentType === 'string' && item.contentType.startsWith('video/')
}

const emit = defineEmits<{
  /** Emitted when the user confirms a selection or uploads a new file. */
  'select': [media: MediaRecord]
  /** Emitted when the user cancels (close button, overlay click, escape). */
  'cancel': []
}>()

const titleId = useId()
const dialogEl = ref<HTMLElement | null>(null)
const searchEl = ref<HTMLInputElement | null>(null)
const uploadEl = ref<HTMLInputElement | null>(null)

// Escape, the Tab trap, initial + restored focus and the body scroll lock.
// The `cancel` emit has always documented Escape; until this it was a lie.
useModalDialog({
  open: toRef(props, 'open'),
  dialog: dialogEl,
  onClose: onCancel,
  initialFocus: () => searchEl.value,
})

const loading = ref(false)
const uploading = ref(false)
const mediaItems = ref<MediaRecord[]>([])
const selectedMedia = ref<MediaRecord | null>(null)
const searchQuery = ref('')
let searchTimeout: ReturnType<typeof setTimeout> | null = null

function csrfHeaders(): Record<string, string> {
  const token = getCsrfToken()
  return token ? { 'X-CSRF-Token': token } : {}
}

function mediaApiBase() {
  return `/api/admin/s/${props.siteId}/media`
}

async function loadMedia() {
  if (!props.siteId) return
  loading.value = true
  try {
    const data = await $fetch<MediaPage>(mediaApiBase(), {
      params: {
        search: searchQuery.value || undefined,
        type: props.mediaType === 'all' ? undefined : props.mediaType,
      },
      headers: csrfHeaders(),
    })
    mediaItems.value = data.items || []
  } catch {
    mediaItems.value = []
  } finally {
    loading.value = false
  }
}

function debouncedSearch() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => loadMedia(), 300)
}

function selectMedia(item: MediaRecord) {
  selectedMedia.value = item
}

function confirmSelection() {
  if (selectedMedia.value) {
    emit('select', selectedMedia.value)
  }
}

function onCancel() {
  emit('cancel')
}

async function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !props.siteId) return
  uploading.value = true
  try {
    if (props.uploadHandler) {
      await props.uploadHandler(file, media => emit('select', media))
      return
    }
    const formData = new FormData()
    formData.append('file', file)
    const record = await $fetch<MediaRecord>(
      `${mediaApiBase()}/upload`,
      { method: 'POST', body: formData, headers: csrfHeaders() },
    )
    // Treat upload as an immediate confirmed selection (parity with TImagePicker).
    emit('select', record)
  } catch (err) {
    console.error('Upload failed:', err)
  } finally {
    uploading.value = false
    input.value = ''
  }
}

// Reset state every time the modal (re)opens. `immediate: true` ensures
// a modal mounted with `open=true` (e.g. in tests) fetches on mount.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      selectedMedia.value = null
      searchQuery.value = ''
      mediaItems.value = []
      loadMedia()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
    searchTimeout = null
  }
})
</script>

<style scoped>
.media-browser__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}
.media-browser__modal {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.media-browser__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--cms-line);
}
.media-browser__header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.media-browser__close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--cms-ink-muted);
}
.media-browser__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}
.media-browser__search {
  margin-bottom: 16px;
}
.media-browser__search input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  font-size: 14px;
}
.media-browser__loading,
.media-browser__empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--cms-ink-subtle);
}
.media-browser__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}
.media-browser__grid-item {
  aspect-ratio: 1;
  padding: 0;
  border: 2px solid var(--cms-line);
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  background: var(--cms-surface-subtle);
}
.media-browser__grid-item--selected {
  border-color: var(--cms-accent);
}
.media-browser__grid-item img,
.media-browser__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.media-browser__grid-item {
  position: relative;
}
.media-browser__play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: var(--cms-ink-inverse);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
  pointer-events: none;
}
.media-browser__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--cms-line);
}
.media-browser__footer-spacer {
  flex: 1;
}
.media-browser__btn {
  padding: 8px 16px;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  background: white;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.media-browser__btn--secondary {
  background: var(--cms-surface-subtle);
}
.media-browser__btn--primary {
  background: var(--cms-accent);
  border-color: var(--cms-accent);
  color: white;
}
.media-browser__btn--primary:disabled {
  background: var(--cms-line-strong);
  border-color: var(--cms-line-strong);
  cursor: not-allowed;
}
</style>
