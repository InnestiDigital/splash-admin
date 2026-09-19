<template>
  <div
    class="t-field t-image"
    :data-disabled="disabled || null"
    :data-uploading="uploading || null"
    :aria-busy="uploading || undefined"
  >
    <label class="t-field__label">
      {{ getLocalizedLabel(field.label) }}
      <span v-if="field.validation?.required" class="t-field__required">*</span>
    </label>

    <!-- Preview -->
    <div class="t-image__preview-area">
      <div v-if="previewUrl" class="t-image__preview">
        <img :src="previewUrl" :alt="getLocalizedLabel(field.label)" />
        <button type="button" class="t-image__remove" :disabled="disabled" @click="removeImage" title="Remove image">
          &times;
        </button>
      </div>
      <button v-else type="button" class="t-image__placeholder" :disabled="disabled" @click="openPicker">
        <span>Click to select image</span>
      </button>
    </div>

    <!-- Actions -->
    <div class="t-image__actions">
      <button type="button" class="t-image__btn" :disabled="disabled" @click="openPicker">
        Browse Media
      </button>
      <label
        class="t-image__btn t-image__btn--secondary"
        :class="{ 't-image__btn--disabled': disabled }"
        :aria-disabled="disabled || undefined"
      >
        Upload New
        <input
          type="file"
          accept="image/*"
          :disabled="disabled"
          data-image-picker-upload
          hidden
          @change="handleInlineUpload"
        />
      </label>
    </div>

    <div
      v-if="uploadError"
      class="t-image__upload-error"
      role="alert"
      data-image-picker-upload-error
    >
      <span>{{ uploadError }}</span>
      <button
        type="button"
        class="t-image__retry"
        :disabled="disabled || uploading"
        data-image-picker-retry
        @click="retryUpload"
      >
        {{ uploading ? 'Retrying…' : 'Retry' }}
      </button>
    </div>

    <p v-if="field.note" class="t-field__note">{{ getLocalizedLabel(field.note) }}</p>

    <!-- Media Picker Modal -->
    <MediaBrowserModal
      :open="showPicker"
      :site-id="siteId"
      title="Select Image"
      :upload-handler="handleModalUpload"
      @select="onMediaSelected"
      @cancel="cancelPicker"
    />
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  inject,
  watch,
  nextTick,
  onBeforeUnmount,
  useId,
  type Ref,
} from 'vue'
import { getLocalizedLabel } from '~/admin/utils/labelUtils'
import { getCsrfToken } from '~/admin/utils/csrf'
import { useEditorChangeStore } from '~/admin/stores/editorChangeStore'
import type { MediaRecord } from '~/server/storage/types'
import MediaBrowserModal from './MediaBrowserModal.vue'
import type {
  MediaUploadCommit,
  MediaUploadOperation,
} from './mediaUpload'
import {
  MEDIA_UPLOAD_OPERATION_KEY,
  resolveMediaUploadOperation,
} from './mediaUpload'

const props = defineProps<{
  field: Record<string, any>
  modelValue?: string | number | Record<string, any> | null
  disabled?: boolean
  /** Include uploads in an editor save scope when this field is guard-owned. */
  uploadOperation?: MediaUploadOperation
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const injectedSiteId = inject<Ref<string>>('siteId', ref(''))
const siteId = computed(() => injectedSiteId.value)

// V2 article authoring: contentData stores media IDs (not URLs). Block
// authoring stores URLs. Discriminator: per-field `valueMode` ('id' | 'url')
// or surface-wide injected default. Default 'url' preserves block back-compat.
const surfaceValueMode = inject<Ref<'id' | 'url'>>('imageValueMode', ref('url'))
const valueMode = computed<'id' | 'url'>(() => (
  (props.field?.options?.valueMode as 'id' | 'url') ?? surfaceValueMode.value
))

// Cached resolved preview URL for ID-mode (looked up via admin media API).
const idPreviewUrl = ref<string | null>(null)
let idPreviewSeen: string | null = null
let uploadRevision = 0
let changeStore: ReturnType<typeof useEditorChangeStore> | null = null
const activeUploads = ref(0)
const uploadError = ref<string | null>(null)
const failedUploadJobKey = ref<string | null>(null)
let untrackedRetry: (() => Promise<boolean>) | null = null
let expectingUploadedValue = false
let expectedUploadedValue: string | null = null

const failedUploadJobState = computed(() => {
  const key = failedUploadJobKey.value
  return key && changeStore ? changeStore.getJob(key) : null
})
const uploading = computed(() => (
  activeUploads.value > 0 || failedUploadJobState.value?.saving === true
))

const injectedUploadOperation = inject(MEDIA_UPLOAD_OPERATION_KEY, undefined)
const resolvedUploadOperation = computed(() => (
  props.uploadOperation
  ?? resolveMediaUploadOperation(injectedUploadOperation, props.field)
))

// A form-level provider naturally returns one target key for all descendant
// fields. The Vue instance id disambiguates repeated fields that share an id.
const pickerUploadIdentity = `${String(props.field?.id || 'image')}:${useId()}`
const uploadJobKey = computed(() => {
  const operation = resolvedUploadOperation.value
  return operation ? `${operation.key}:image-upload:${pickerUploadIdentity}` : null
})

function looksLikeId(v: unknown): v is string {
  return typeof v === 'string'
    && v.length > 0
    && !v.startsWith('http')
    && !v.startsWith('/')
}

function csrfHeaders(): Record<string, string> {
  const token = getCsrfToken()
  return token ? { 'X-CSRF-Token': token } : {}
}

async function fetchMediaUrlById(id: string): Promise<string | null> {
  if (!siteId.value) return null
  try {
    const rec = await $fetch<MediaRecord>(`/api/admin/s/${siteId.value}/media/${id}`, {
      headers: csrfHeaders(),
    })
    return rec?.url ?? null
  } catch {
    return null
  }
}

watch(
  () => props.modelValue,
  async (v) => {
    if (expectingUploadedValue && v === expectedUploadedValue) {
      expectingUploadedValue = false
      expectedUploadedValue = null
    } else {
      cancelUploadIntent()
    }
    // A URL typed elsewhere, a manual library selection, or a parent reset is
    // newer intent than any upload that is still in flight.
    if (valueMode.value !== 'id') { idPreviewUrl.value = null; idPreviewSeen = null; return }
    if (!looksLikeId(v)) { idPreviewUrl.value = null; idPreviewSeen = null; return }
    if (idPreviewSeen === v) return
    idPreviewSeen = v
    idPreviewUrl.value = await fetchMediaUrlById(v)
  },
  { immediate: true },
)

const showPicker = ref(false)

const previewUrl = computed(() => {
  if (!props.modelValue) return null
  if (typeof props.modelValue === 'object') {
    return (props.modelValue as any).src || (props.modelValue as any).url || (props.modelValue as any).thumbnail
  }
  if (typeof props.modelValue === 'string') {
    if (props.modelValue.startsWith('http') || props.modelValue.startsWith('/')) {
      return props.modelValue
    }
    // ID-mode: resolved URL fetched on demand from admin media endpoint.
    if (valueMode.value === 'id' && idPreviewUrl.value) return idPreviewUrl.value
  }
  return null
})

function openPicker() {
  if (props.disabled) return
  showPicker.value = true
}

function closePicker() {
  showPicker.value = false
}

function cancelPicker() {
  cancelUploadIntent()
  closePicker()
}

function commitMedia(media: MediaRecord) {
  emit('update:modelValue', valueMode.value === 'id' ? media.id : media.url)
  closePicker()
}

function onMediaSelected(media: MediaRecord) {
  // Owner-managed modal uploads call the modal's commit callback, which emits
  // this event synchronously. That is the current upload, not newer intent.
  if (!expectingUploadedValue) cancelUploadIntent()
  commitMedia(media)
}

function removeImage() {
  cancelUploadIntent()
  emit('update:modelValue', null)
}

function trackedChangeStore() {
  changeStore ??= useEditorChangeStore()
  return changeStore
}

function uploadErrorMessage(error: unknown): string {
  const detail = error instanceof Error && error.message
    ? error.message
    : typeof error === 'string' && error
      ? error
      : 'Please try again.'
  return `Image upload failed. ${detail}`
}

function clearUploadError(): void {
  uploadError.value = null
  failedUploadJobKey.value = null
  untrackedRetry = null
}

function cancelUploadIntent(jobKey = uploadJobKey.value): void {
  uploadRevision++
  expectingUploadedValue = false
  expectedUploadedValue = null
  clearUploadError()
  if (jobKey && changeStore) changeStore.discardJob(jobKey)
}

async function uploadRecord(
  uploadSiteId: string,
  file: File,
  revision: number,
  commit: MediaUploadCommit,
): Promise<void> {
  const formData = new FormData()
  formData.append('file', file)
  const record = await $fetch<MediaRecord>(
    `/api/admin/s/${uploadSiteId}/media/upload`,
    { method: 'POST', body: formData, headers: csrfHeaders() },
  )

  // Multiple requests may already be queued in one lane. Only the newest
  // user intent is allowed to update the field.
  if (revision !== uploadRevision) return
  expectingUploadedValue = true
  expectedUploadedValue = valueMode.value === 'id' ? record.id : record.url
  commit(record)

  // Keep the upload registered until consumers have reacted to the emitted
  // value and queued any resulting autosave job.
  await nextTick()
  expectingUploadedValue = false
  expectedUploadedValue = null
}

async function runUntrackedUpload(
  run: () => Promise<void>,
  revision: number,
): Promise<boolean> {
  activeUploads.value++
  try {
    await run()
    if (revision === uploadRevision) clearUploadError()
    return true
  } catch (error) {
    if (revision === uploadRevision) uploadError.value = uploadErrorMessage(error)
    return false
  } finally {
    activeUploads.value--
  }
}

async function uploadAndCommit(
  file: File,
  commit: MediaUploadCommit,
  closeModalOnFailure = false,
): Promise<void> {
  const uploadSiteId = siteId.value
  if (!uploadSiteId) return

  const revision = ++uploadRevision
  const operation = resolvedUploadOperation.value
  const jobKey = uploadJobKey.value
  clearUploadError()

  const run = () => uploadRecord(uploadSiteId, file, revision, commit)
  if (!operation || !jobKey) {
    untrackedRetry = () => runUntrackedUpload(run, revision)
    const ok = await untrackedRetry()
    if (!ok && closeModalOnFailure) closePicker()
    return
  }

  const changes = trackedChangeStore()
  changes.queue({
    key: jobKey,
    surface: operation.surface,
    scope: operation.scope,
    label: operation.label ?? 'Upload image',
    delay: 0,
    run,
  })

  activeUploads.value++
  try {
    const ok = await changes.flushJob(jobKey)
    if (revision !== uploadRevision) return
    if (ok) {
      changes.discardJob(jobKey)
      clearUploadError()
    } else {
      failedUploadJobKey.value = jobKey
      uploadError.value = uploadErrorMessage(
        changes.getJob(jobKey)?.error ?? 'Please try again.',
      )
      if (closeModalOnFailure) closePicker()
    }
  } finally {
    activeUploads.value--
  }
}

async function retryUpload(): Promise<void> {
  if (uploading.value) return
  const jobKey = failedUploadJobKey.value
  if (!jobKey) {
    if (untrackedRetry) await untrackedRetry()
    return
  }

  activeUploads.value++
  try {
    const changes = trackedChangeStore()
    const ok = await changes.flushJob(jobKey)
    if (ok) {
      changes.discardJob(jobKey)
      clearUploadError()
    } else {
      uploadError.value = uploadErrorMessage(
        changes.getJob(jobKey)?.error ?? 'Please try again.',
      )
    }
  } finally {
    activeUploads.value--
  }
}

// Inline "Upload New" button (outside the picker modal) — preserves the legacy
// upload-without-opening-modal flow that block authoring relied on.
async function handleInlineUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  await uploadAndCommit(file, commitMedia)
}

async function handleModalUpload(file: File, commit: MediaUploadCommit) {
  await uploadAndCommit(file, commit, true)
}

onBeforeUnmount(() => {
  uploadRevision++
})

watch(uploadJobKey, (next, previous) => {
  if (!previous || previous === next) return
  cancelUploadIntent(previous)
})

// The global save indicator retries retained jobs directly. Mirror that job's
// lifecycle locally so a successful global retry clears this field's alert,
// and remove the now-clean upload-only job from the coordinator registry.
watch(
  () => {
    const job = failedUploadJobState.value
    return job
      ? { dirty: job.dirty, saving: job.saving, error: job.error }
      : null
  },
  (state) => {
    const key = failedUploadJobKey.value
    if (!key || !state) return
    if (state.error) {
      uploadError.value = uploadErrorMessage(state.error)
      return
    }
    if (state.dirty || state.saving) return

    clearUploadError()
    changeStore?.discardJob(key)
  },
)
</script>

<style scoped>
.t-field {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.t-image[data-disabled='true'] {
  opacity: 0.62;
}

.t-field__label {
  margin: 0 0 var(--cms-sp-2, 8px);
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-sm, 13px);
  font-weight: 600;
  line-height: 1.35;
}

.t-field__required {
  color: var(--cms-danger, var(--cms-danger));
}

.t-field__note {
  margin: var(--cms-sp-1, 4px) 0 0;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-caption, 12px);
  line-height: 1.5;
}

.t-image__preview-area {
  margin-bottom: var(--cms-sp-3, 12px);
}

.t-image__preview {
  position: relative;
  display: inline-block;
  max-width: 200px;
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-control, 6px);
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  overflow: hidden;
}

.t-image__preview img {
  display: block;
  max-width: 100%;
  height: auto;
}

.t-image__remove {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--cms-density-sm, 34px);
  height: var(--cms-density-sm, 34px);
  padding: 0;
  border: none;
  border-radius: var(--cms-radius-pill, 999px);
  color: var(--cms-ink-inverse, var(--cms-ink-inverse));
  background: color-mix(in srgb, var(--cms-ink) 76%, transparent);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.t-image__remove:focus-visible,
.t-image__placeholder:focus-visible {
  outline: 2px solid var(--cms-surface);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px var(--cms-accent, var(--cms-accent));
}

.t-image__remove:active {
  transform: scale(0.94);
}

.t-image__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cms-sp-2, 8px);
  min-height: 112px;
  padding: var(--cms-sp-5, 24px);
  border: 1px dashed var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  font-size: var(--cms-fs-sm, 13px);
  font-family: inherit;
  line-height: 1.4;
  cursor: pointer;
  transition:
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .t-image__placeholder:hover:not(:disabled) {
    border-color: var(--cms-accent, var(--cms-accent));
    color: var(--cms-accent-pressed, var(--cms-accent-pressed));
    background: var(--cms-accent-softest, var(--cms-accent-softest));
  }

  .t-image__btn:hover:not(:disabled):not(.t-image__btn--disabled) {
    border-color: var(--cms-line-hover, var(--cms-line-hover));
    color: var(--cms-ink, var(--cms-ink));
    background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  }

  .t-image__btn--secondary:hover:not(.t-image__btn--disabled) {
    background: var(--cms-surface-sunken, var(--cms-surface-sunken));
  }

  .t-image__remove:hover:not(:disabled) {
    background: var(--cms-danger, var(--cms-danger));
  }
}

.t-image__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cms-sp-2, 8px);
}

.t-image__upload-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-sp-2, 8px);
  margin-top: var(--cms-sp-2, 8px);
  padding: var(--cms-sp-2, 8px) var(--cms-sp-3, 12px);
  border: 1px solid color-mix(in srgb, var(--cms-danger, #9e2b25) 42%, transparent);
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-danger, var(--cms-danger));
  background: color-mix(in srgb, var(--cms-danger, #9e2b25) 7%, var(--cms-surface));
  font-size: var(--cms-fs-caption, 12px);
  line-height: 1.4;
}

.t-image__retry {
  flex: 0 0 auto;
  padding: var(--cms-sp-1, 4px) var(--cms-sp-2, 8px);
  border: 1px solid currentColor;
  border-radius: var(--cms-radius-control, 6px);
  color: inherit;
  background: transparent;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.t-image__retry:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

.t-image__retry:active:not(:disabled) {
  transform: scale(0.97);
}

.t-image__retry:disabled {
  cursor: wait;
  opacity: 0.62;
}

.t-image__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--cms-density-md, 40px);
  margin: 0;
  padding: 0 var(--cms-sp-3, 12px);
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: var(--cms-surface);
  font-family: inherit;
  font-size: var(--cms-fs-sm, 13px);
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition:
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.t-image__btn:focus-visible,
.t-image__btn:has(input:focus-visible) {
  outline: 2px solid var(--cms-accent, var(--cms-accent));
  outline-offset: 2px;
}

.t-image__btn:active:not(:disabled):not(.t-image__btn--disabled) {
  transform: scale(0.98);
}

.t-image__placeholder:disabled,
.t-image__remove:disabled,
.t-image__btn:disabled,
.t-image__btn--disabled {
  cursor: not-allowed;
}

.t-image__btn--secondary {
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}
</style>
