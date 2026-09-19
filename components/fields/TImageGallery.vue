<script setup lang="ts">
import { computed, inject, reactive, ref, watch, type Ref } from 'vue'
import { getCsrfToken } from '~/admin/utils/csrf'
import { getLocalizedLabel } from '~/admin/utils/labelUtils'
import type { GalleryItem } from '~/shared/types/blog2-content'
import type { MediaRecord } from '~/server/storage/types'
import MediaBrowserModal from './MediaBrowserModal.vue'

interface Props {
  modelValue?: GalleryItem[]
  /**
   * Schema descriptor — present when rendered through FormRenderer. Used to
   * surface the field's label/required marker. Optional so the component
   * still works when mounted directly with just a modelValue.
   */
  field?: Record<string, any>
  /** Disabled flag (FormRenderer wires this from `field.dependsOn`). */
  disabled?: boolean
  /** Editing locale for caption / alt fields. Falls back to 'en-US'. */
  editingLocale?: string
  /**
   * Optional media URL resolver for thumbnails.
   * When omitted, the component fetches each mediaId from the admin
   * media API and caches the resulting `.url`. Tests / non-admin callers
   * can inject a synchronous resolver to bypass the API.
   */
  resolveMediaUrl?: (mediaId: string) => string | null
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => [],
  field: undefined,
  disabled: false,
  editingLocale: 'en-US',
  resolveMediaUrl: undefined,
})

const fieldLabel = computed(() => getLocalizedLabel(props.field?.label))
const fieldNote = computed(() => getLocalizedLabel(props.field?.note))
const required = computed(() => Boolean(props.field?.validation?.required))

const emit = defineEmits<{ 'update:modelValue': [GalleryItem[]] }>()

// Optional inject — parent panel may provide an editing-locale ref.
const injectedLocale = inject<Ref<string> | null>('editingLocale', null)
const activeLocale = computed(
  () => injectedLocale?.value ?? props.editingLocale ?? 'en-US',
)

const injectedSiteId = inject<Ref<string>>('siteId', ref(''))
const siteId = computed(() => injectedSiteId.value)

// mediaId → resolved URL cache (admin media API). Populated lazily as
// gallery items are rendered.
const urlCache = reactive<Record<string, string>>({})
// Track in-flight fetches to avoid duplicate hits per mediaId.
const inFlight = new Set<string>()

function csrfHeaders(): Record<string, string> {
  const token = getCsrfToken()
  return token ? { 'X-CSRF-Token': token } : {}
}

async function fetchMediaUrl(mediaId: string): Promise<void> {
  if (!mediaId || urlCache[mediaId] || inFlight.has(mediaId)) return
  if (!siteId.value) return
  inFlight.add(mediaId)
  try {
    const rec = await $fetch<MediaRecord>(
      `/api/admin/s/${siteId.value}/media/${mediaId}`,
      { headers: csrfHeaders() },
    )
    if (rec?.url) urlCache[mediaId] = rec.url
  } catch {
    // Ignore — thumbnail will stay empty (placeholder bg renders).
  } finally {
    inFlight.delete(mediaId)
  }
}

/** Public accessor: resolved URL for a mediaId, or null while loading. */
function resolvedUrl(mediaId: string | undefined): string | null {
  if (!mediaId) return null
  if (props.resolveMediaUrl) return props.resolveMediaUrl(mediaId)
  if (urlCache[mediaId]) return urlCache[mediaId]
  // Trigger fetch on demand (fire-and-forget). The reactive cache update
  // will rerun the computed in the template once the URL lands.
  void fetchMediaUrl(mediaId)
  return null
}

// Pre-warm the cache whenever the gallery list changes so the first render
// of new items can hit the cache immediately on subsequent reactivity ticks.
watch(
  () => props.modelValue.map((i) => i.mediaId).join('|'),
  () => {
    if (props.resolveMediaUrl) return
    for (const item of props.modelValue) {
      if (item.mediaId && !urlCache[item.mediaId]) void fetchMediaUrl(item.mediaId)
    }
  },
  { immediate: true },
)

function emitUpdate(next: GalleryItem[]): void {
  emit('update:modelValue', next)
}

function uuid(): string {
  // crypto.randomUUID exists in modern browsers + Node 19+. Fall back to small RNG.
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function addItem(mediaId: string): void {
  emitUpdate([
    ...props.modelValue,
    { id: uuid(), mediaId, caption: {}, alt: {} },
  ])
}

function removeItem(idx: number): void {
  const next = props.modelValue.filter((_, i) => i !== idx)
  emitUpdate(next)
}

function moveItem(fromIdx: number, toIdx: number): void {
  if (fromIdx === toIdx) return
  if (fromIdx < 0 || fromIdx >= props.modelValue.length) return
  if (toIdx < 0 || toIdx >= props.modelValue.length) return
  const next = [...props.modelValue]
  const [moved] = next.splice(fromIdx, 1)
  if (!moved) return
  next.splice(toIdx, 0, moved)
  emitUpdate(next)
}

function setCaption(idx: number, value: string): void {
  const item = props.modelValue[idx]
  if (!item) return
  const next = [...props.modelValue]
  next[idx] = {
    ...item,
    caption: { ...(item.caption ?? {}), [activeLocale.value]: value },
  }
  emitUpdate(next)
}

function setAlt(idx: number, value: string): void {
  const item = props.modelValue[idx]
  if (!item) return
  const next = [...props.modelValue]
  next[idx] = {
    ...item,
    alt: { ...(item.alt ?? {}), [activeLocale.value]: value },
  }
  emitUpdate(next)
}

function setFocalPoint(idx: number, axis: 'x' | 'y', value: number): void {
  const item = props.modelValue[idx]
  if (!item) return
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const current = item.focalPoint ?? { x: 0.5, y: 0.5 }
  const next = [...props.modelValue]
  next[idx] = {
    ...item,
    focalPoint: { ...current, [axis]: clamped },
  }
  emitUpdate(next)
}

defineExpose({ addItem, removeItem, moveItem, setCaption, setAlt, setFocalPoint })

// MediaBrowserModal wiring — replaces the legacy `window.prompt` flow.
const showPicker = ref(false)

function onAddClicked(): void {
  showPicker.value = true
}

function onMediaSelected(media: MediaRecord): void {
  // Cache the URL eagerly so the new thumbnail renders without an extra fetch.
  if (media.url) urlCache[media.id] = media.url
  addItem(media.id)
  showPicker.value = false
}

function onPickerCancel(): void {
  showPicker.value = false
}
</script>

<template>
  <div class="t-image-gallery" :data-disabled="disabled || null">
    <label v-if="fieldLabel" class="t-image-gallery__field-label">
      {{ fieldLabel }}
      <span v-if="required" class="t-image-gallery__required">*</span>
    </label>
    <p v-if="fieldNote" class="t-image-gallery__note">{{ fieldNote }}</p>

    <div
      v-if="modelValue.length === 0"
      data-gallery-empty
      class="t-image-gallery__empty"
    >
      No images yet.
    </div>
    <ul v-else class="t-image-gallery__items">
      <li
        v-for="(item, idx) in modelValue"
        :key="item.id"
        data-gallery-item
        class="t-image-gallery__item"
      >
        <div class="t-image-gallery__order">
          <button
            type="button"
            data-gallery-up
            :disabled="disabled || idx === 0"
            aria-label="Move up"
            @click="moveItem(idx, idx - 1)"
          >&uarr;</button>
          <button
            type="button"
            data-gallery-down
            :disabled="disabled || idx === modelValue.length - 1"
            aria-label="Move down"
            @click="moveItem(idx, idx + 1)"
          >&darr;</button>
        </div>

        <img
          v-if="item.mediaId && resolvedUrl(item.mediaId)"
          :src="resolvedUrl(item.mediaId) || ''"
          :alt="(item.alt && item.alt[activeLocale]) || ''"
          class="t-image-gallery__thumb"
        />
        <div
          v-else-if="item.mediaId"
          class="t-image-gallery__thumb t-image-gallery__thumb--loading"
          data-gallery-thumb-loading
          aria-hidden="true"
        />

        <div class="t-image-gallery__inputs">
          <label class="t-image-gallery__label">
            Caption
            <input
              type="text"
              data-gallery-caption
              :disabled="disabled"
              :value="(item.caption && item.caption[activeLocale]) || ''"
              @input="setCaption(idx, ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="t-image-gallery__label">
            Alt text
            <input
              type="text"
              data-gallery-alt
              :disabled="disabled"
              :value="(item.alt && item.alt[activeLocale]) || ''"
              @input="setAlt(idx, ($event.target as HTMLInputElement).value)"
            />
          </label>
          <div class="t-image-gallery__focal">
            <label class="t-image-gallery__label">
              Focal X
              <input
                type="number"
                data-gallery-focal-x
                min="0"
                max="1"
                step="0.05"
                :disabled="disabled"
                :value="item.focalPoint?.x ?? 0.5"
                @input="setFocalPoint(idx, 'x', parseFloat(($event.target as HTMLInputElement).value))"
              />
            </label>
            <label class="t-image-gallery__label">
              Focal Y
              <input
                type="number"
                data-gallery-focal-y
                min="0"
                max="1"
                step="0.05"
                :disabled="disabled"
                :value="item.focalPoint?.y ?? 0.5"
                @input="setFocalPoint(idx, 'y', parseFloat(($event.target as HTMLInputElement).value))"
              />
            </label>
          </div>
        </div>

        <button
          type="button"
          data-gallery-remove
          aria-label="Remove image"
          class="t-image-gallery__remove"
          :disabled="disabled"
          @click="removeItem(idx)"
        >&times;</button>
      </li>
    </ul>

    <button
      type="button"
      class="t-image-gallery__add"
      data-gallery-add
      :disabled="disabled"
      @click="onAddClicked"
    >+ Add image</button>

    <MediaBrowserModal
      :open="showPicker"
      :site-id="siteId"
      title="Add gallery image"
      @select="onMediaSelected"
      @cancel="onPickerCancel"
    />
  </div>
</template>

<style scoped>
.t-image-gallery {
  display: flex;
  flex-direction: column;
  gap: var(--cms-sp-3, 12px);
  container-type: inline-size;
}
.t-image-gallery[data-disabled='true'] {
  opacity: 0.65;
  pointer-events: none;
}
.t-image-gallery__field-label {
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-sm, 13px);
  font-weight: 600;
}
.t-image-gallery__required {
  color: var(--cms-danger, var(--cms-danger));
}
.t-image-gallery__note {
  margin: 0;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-caption, 12px);
  line-height: 1.45;
}
.t-image-gallery__items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--cms-sp-3, 12px);
}
.t-image-gallery__item {
  display: grid;
  grid-template-columns: auto 80px 1fr auto;
  gap: var(--cms-sp-2, 8px);
  align-items: center;
  padding: var(--cms-sp-2, 8px);
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}
.t-image-gallery__order {
  display: flex;
  flex-direction: column;
  gap: var(--cms-sp-1, 4px);
}
.t-image-gallery__order button {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: var(--cms-surface);
  cursor: pointer;
  font-size: var(--cms-fs-caption, 12px);
  touch-action: manipulation;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}
.t-image-gallery__order button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.t-image-gallery__thumb {
  width: 80px;
  height: 60px;
  object-fit: cover;
  border-radius: var(--cms-radius-control, 6px);
  background: var(--cms-surface-sunken, var(--cms-surface-sunken));
}
.t-image-gallery__thumb--loading {
  display: block;
}
.t-image-gallery__inputs {
  display: grid;
  gap: var(--cms-sp-1, 4px);
  min-width: 0;
}
.t-image-gallery__label {
  display: block;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-caption, 12px);
  font-weight: 600;
}
.t-image-gallery__label input {
  width: 100%;
  min-height: 34px;
  margin-top: 2px;
  padding: 7px 8px;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: var(--cms-surface);
  font: inherit;
  font-size: var(--cms-fs-sm, 13px);
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    box-shadow var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}
.t-image-gallery__focal {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--cms-sp-2, 8px);
}
.t-image-gallery__remove {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: var(--cms-surface);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: manipulation;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}
.t-image-gallery__empty {
  padding: var(--cms-sp-4, 16px);
  border: 1px dashed var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-card, 10px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  text-align: center;
  font-size: var(--cms-fs-sm, 13px);
}
.t-image-gallery__add {
  align-self: flex-start;
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

.t-image-gallery__label input:focus-visible {
  outline: none;
  border-color: var(--cms-accent, var(--cms-accent));
  box-shadow: 0 0 0 3px var(--cms-accent-ring, rgba(46, 125, 50, 0.2));
}

.t-image-gallery__order button:focus-visible,
.t-image-gallery__remove:focus-visible,
.t-image-gallery__add:focus-visible {
  outline: 2px solid var(--cms-accent, var(--cms-accent));
  outline-offset: 2px;
}

.t-image-gallery__order button:active:not(:disabled),
.t-image-gallery__remove:active:not(:disabled),
.t-image-gallery__add:active:not(:disabled) {
  transform: scale(0.97);
}

.t-image-gallery__remove:disabled,
.t-image-gallery__add:disabled,
.t-image-gallery__label input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (hover: hover) and (pointer: fine) {
  .t-image-gallery__order button:hover:not(:disabled),
  .t-image-gallery__add:hover:not(:disabled) {
    border-color: var(--cms-line-hover, var(--cms-line-hover));
    background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  }

  .t-image-gallery__remove:hover:not(:disabled) {
    border-color: var(--cms-danger, var(--cms-danger));
    color: var(--cms-danger, var(--cms-danger));
    background: var(--cms-danger-soft, var(--cms-danger-soft));
  }
}

@container (max-width: 520px) {
  .t-image-gallery__item {
    grid-template-columns: auto 64px minmax(0, 1fr) auto;
  }

  .t-image-gallery__thumb {
    width: 64px;
    height: 48px;
  }
}
</style>
