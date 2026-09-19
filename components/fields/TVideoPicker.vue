<template>
  <div class="t-field t-video" :data-disabled="disabled || null">
    <label class="t-field__label">
      {{ getLocalizedLabel(field.label) }}
      <span v-if="field.validation?.required" class="t-field__required">*</span>
    </label>

    <!-- Preview -->
    <div class="t-video__preview-area">
      <div v-if="previewUrl" class="t-video__preview">
        <video :src="previewUrl" preload="metadata" muted playsinline controls></video>
        <button type="button" class="t-video__remove" :disabled="disabled" @click="removeVideo" title="Remove video">
          &times;
        </button>
      </div>
      <button v-else type="button" class="t-video__placeholder" :disabled="disabled" @click="openPicker">
        <span>Click to select video</span>
      </button>
    </div>

    <!-- Actions -->
    <div class="t-video__actions">
      <button type="button" class="t-video__btn" :disabled="disabled" @click="openPicker">
        Browse Media
      </button>
      <label
        class="t-video__btn t-video__btn--secondary"
        :class="{ 't-video__btn--disabled': disabled }"
        :aria-disabled="disabled || undefined"
      >
        Upload New
        <input type="file" accept="video/mp4,video/webm" :disabled="disabled" @change="handleInlineUpload" hidden />
      </label>
    </div>

    <p v-if="field.note" class="t-field__note">{{ getLocalizedLabel(field.note) }}</p>

    <!-- Media Picker Modal (video only) -->
    <MediaBrowserModal
      :open="showPicker"
      :site-id="siteId"
      media-type="video"
      accept="video/mp4,video/webm"
      title="Select Video"
      @select="onMediaSelected"
      @cancel="closePicker"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, type Ref } from 'vue'
import { getLocalizedLabel } from '~/admin/utils/labelUtils'
import { getCsrfToken } from '~/admin/utils/csrf'
import type { MediaRecord } from '~/server/storage/types'
import MediaBrowserModal from './MediaBrowserModal.vue'

// Mirrors TImagePicker's contract for URL-valued fields: value = media URL string.
// Video authoring stores URLs (block settings), so — unlike TImagePicker — there is
// no id-mode article path here.
const props = defineProps<{
  field: Record<string, any>
  modelValue?: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const injectedSiteId = inject<Ref<string>>('siteId', ref(''))
const siteId = computed(() => injectedSiteId.value)

const showPicker = ref(false)

const previewUrl = computed(() => {
  const v = props.modelValue
  if (typeof v === 'string' && (v.startsWith('http') || v.startsWith('/'))) return v
  return null
})

function csrfHeaders(): Record<string, string> {
  const token = getCsrfToken()
  return token ? { 'X-CSRF-Token': token } : {}
}

function openPicker() {
  if (props.disabled) return
  showPicker.value = true
}

function closePicker() {
  showPicker.value = false
}

function onMediaSelected(media: MediaRecord) {
  emit('update:modelValue', media.url)
  closePicker()
}

function removeVideo() {
  emit('update:modelValue', null)
}

async function handleInlineUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !siteId.value) return
  try {
    const formData = new FormData()
    formData.append('file', file)
    const record = await $fetch<MediaRecord>(
      `/api/admin/s/${siteId.value}/media/upload`,
      { method: 'POST', body: formData, headers: csrfHeaders() },
    )
    emit('update:modelValue', record.url)
  } catch (err) {
    console.error('Upload failed:', err)
  } finally {
    input.value = ''
  }
}
</script>

<style scoped>
.t-field {
  display: flex;
  flex-direction: column;
}

.t-video[data-disabled='true'] {
  opacity: 0.62;
}
.t-field__label {
  margin-bottom: 8px;
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-sm, 13px);
  font-weight: 600;
}
.t-field__required {
  color: var(--cms-danger, var(--cms-danger));
}
.t-field__note {
  margin-top: 6px;
  margin-bottom: 0;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-caption, 12px);
  line-height: 1.45;
}
.t-video__preview-area {
  margin-bottom: 12px;
}
.t-video__preview {
  position: relative;
  display: inline-block;
  max-width: 320px;
  overflow: hidden;
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-control, 6px);
  background: var(--cms-surface-sunken, var(--cms-surface-sunken));
}
.t-video__preview video {
  display: block;
  max-width: 100%;
  height: auto;
}
.t-video__remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: var(--cms-radius-pill, 999px);
  color: var(--cms-ink-inverse, var(--cms-ink-inverse));
  background: rgba(33, 30, 25, 0.72);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: manipulation;
  transition:
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}
.t-video__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px;
  border: 1px dashed var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-card, 10px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  font: inherit;
  cursor: pointer;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}
.t-video__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.t-video__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 8px 12px;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: var(--cms-surface);
  font-size: var(--cms-fs-sm, 13px);
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}
.t-video__btn--secondary {
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}

.t-video__btn:focus-visible,
.t-video__remove:focus-visible,
.t-video__placeholder:focus-visible {
  outline: 2px solid var(--cms-accent, var(--cms-accent));
  outline-offset: 2px;
}

.t-video__btn:active:not(:disabled),
.t-video__remove:active:not(:disabled) {
  transform: scale(0.97);
}

.t-video__btn:disabled,
.t-video__remove:disabled,
.t-video__btn--disabled,
.t-video__placeholder:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (hover: hover) and (pointer: fine) {
  .t-video__placeholder:hover:not(:disabled) {
    border-color: var(--cms-accent, var(--cms-accent));
    color: var(--cms-accent-pressed, var(--cms-accent-pressed));
    background: var(--cms-accent-softest, var(--cms-accent-softest));
  }

  .t-video__btn:hover:not(:disabled) {
    border-color: var(--cms-line-hover, var(--cms-line-hover));
    background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  }

  .t-video__remove:hover:not(:disabled) {
    background: var(--cms-danger, var(--cms-danger));
  }
}
</style>
