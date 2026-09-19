<template>
  <section class="font-manager">
    <header class="font-manager__header">
      <h3 class="font-manager__title">Custom Fonts</h3>
      <p class="font-manager__desc">
        Upload WOFF2 / WOFF brand fonts. They appear in every font-family
        picker across the editor and are frozen into published snapshots.
      </p>
    </header>

    <!-- Quota readout -->
    <div v-if="store.fontsLoaded" class="font-manager__quota">
      <span>{{ formatBytes(store.fontsUsedBytes) }} used</span>
      <span v-if="store.fontsQuotaBytes > 0"> of {{ formatBytes(store.fontsQuotaBytes) }}</span>
    </div>

    <!-- Upload form -->
    <form class="font-manager__form" @submit.prevent="onSubmit">
      <div class="font-manager__row">
        <label class="font-manager__label" :for="formIds.name">Display name</label>
        <input
          :id="formIds.name"
          v-model.trim="draftName"
          type="text"
          required
          maxlength="100"
          placeholder="e.g. Helvetica Neue Brand"
          class="font-manager__input"
        >
      </div>

      <div class="font-manager__row font-manager__row--inline">
        <div>
          <label class="font-manager__label" :for="formIds.weight">Weight</label>
          <input
            :id="formIds.weight"
            v-model.number="draftWeight"
            type="number"
            min="1"
            max="1000"
            step="100"
            class="font-manager__input font-manager__input--sm"
          >
        </div>
        <div>
          <label class="font-manager__label" :for="formIds.style">Style</label>
          <select :id="formIds.style" v-model="draftStyle" class="font-manager__input font-manager__input--sm">
            <option value="normal">Normal</option>
            <option value="italic">Italic</option>
          </select>
        </div>
      </div>

      <div class="font-manager__row">
        <label class="font-manager__label" :for="formIds.fallback">Fallback stack <span class="font-manager__optional">(optional)</span></label>
        <input
          :id="formIds.fallback"
          v-model.trim="draftFallback"
          type="text"
          placeholder="Georgia, serif"
          class="font-manager__input"
        >
      </div>

      <div class="font-manager__row">
        <label class="font-manager__label" :for="formIds.file">Font file</label>
        <input
          :id="formIds.file"
          ref="fileInput"
          type="file"
          accept=".woff2,.woff,font/woff2,font/woff"
          @change="onFileChange"
        >
        <p v-if="store.fontsMaxFileBytes" class="font-manager__hint">
          Max file size: {{ formatBytes(store.fontsMaxFileBytes) }}
        </p>
      </div>

      <div v-if="store.fontsError" class="font-manager__error" role="alert">
        {{ store.fontsError }}
      </div>

      <button
        type="submit"
        class="font-manager__submit"
        :disabled="!canSubmit"
      >
        <span v-if="store.fontsUploading">Uploading…</span>
        <span v-else>Upload font</span>
      </button>
    </form>

    <!-- Uploaded fonts list -->
    <ul v-if="store.fonts.length" class="font-manager__list">
      <li v-for="font in store.fonts" :key="font.id" class="font-manager__item">
        <div class="font-manager__item-meta">
          <strong class="font-manager__item-name">{{ font.name }}</strong>
          <span class="font-manager__item-detail">
            {{ font.weight }} · {{ font.style }} · {{ formatBytes(font.fileSize) }}
          </span>
          <span v-if="font.refCount > 0" class="font-manager__badge">In use ({{ font.refCount }})</span>
        </div>
        <button
          type="button"
          class="font-manager__delete"
          :disabled="font.refCount > 0"
          :title="font.refCount > 0 ? 'Unpublish the versions referencing this font first' : 'Delete font'"
          @click="onDelete(font.id)"
        >
          Delete
        </button>
      </li>
    </ul>
    <p v-else-if="store.fontsLoaded" class="font-manager__empty">
      No custom fonts uploaded yet.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useEditorStore } from '~/admin/stores/editorStore'
import type { FontStyle } from '~/shared/types/fontAssets'

const store = useEditorStore()

const draftName = ref('')
const draftWeight = ref<number>(400)
const draftStyle = ref<FontStyle>('normal')
const draftFallback = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const pickedFile = ref<File | null>(null)

// Random suffix so multiple mount points don't clash on form field ids.
const uid = Math.random().toString(36).slice(2, 8)
const formIds = {
  name: `fm-name-${uid}`,
  weight: `fm-weight-${uid}`,
  style: `fm-style-${uid}`,
  fallback: `fm-fallback-${uid}`,
  file: `fm-file-${uid}`,
}

const canSubmit = computed(() =>
  !store.fontsUploading
  && draftName.value.length > 0
  && pickedFile.value !== null
  && Number.isFinite(draftWeight.value)
  && draftWeight.value >= 1
  && draftWeight.value <= 1000,
)

onMounted(() => {
  if (!store.fontsLoaded) store.fetchFonts()
})

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  pickedFile.value = input.files?.[0] ?? null
}

async function onSubmit() {
  if (!canSubmit.value || !pickedFile.value) return
  const created = await store.uploadFont(pickedFile.value, {
    name: draftName.value,
    weight: draftWeight.value,
    style: draftStyle.value,
    fallbackStack: draftFallback.value || null,
  })
  if (created) {
    draftName.value = ''
    draftWeight.value = 400
    draftStyle.value = 'normal'
    draftFallback.value = ''
    pickedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function onDelete(id: string) {
  if (!confirm('Delete this font? This cannot be undone.')) return
  await store.deleteFont(id)
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
</script>

<style scoped>
.font-manager {
  border: 1px solid var(--cms-line);
  border-radius: 6px;
  padding: 12px;
  background: var(--cms-surface);
  margin-top: 16px;
}

.font-manager__header {
  margin-bottom: 12px;
}

.font-manager__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--cms-ink-body);
  margin: 0 0 4px;
}

.font-manager__desc {
  font-size: 11px;
  color: #777;
  margin: 0;
  line-height: 1.4;
}

.font-manager__quota {
  font-size: 11px;
  color: var(--cms-ink-body);
  margin-bottom: 10px;
}

.font-manager__form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--cms-surface-subtle);
  margin-bottom: 12px;
}

.font-manager__row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.font-manager__row--inline {
  flex-direction: row;
  gap: 10px;
}

.font-manager__row--inline > div {
  flex: 1;
}

.font-manager__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--cms-ink-body);
}

.font-manager__optional {
  font-weight: 400;
  color: var(--cms-ink-subtle);
}

.font-manager__input {
  width: 100%;
  font-size: 12px;
  padding: 6px 8px;
  border: 1px solid var(--cms-line-strong);
  border-radius: 4px;
  background: var(--cms-surface);
}

.font-manager__input--sm {
  max-width: 120px;
}

.font-manager__hint {
  font-size: 11px;
  color: var(--cms-ink-subtle);
  margin: 4px 0 0;
}

.font-manager__error {
  font-size: 11px;
  color: #c0392b;
  background: #fdecea;
  padding: 6px 8px;
  border-radius: 4px;
}

.font-manager__submit {
  align-self: flex-start;
  font-size: 12px;
  padding: 6px 12px;
  background: var(--cms-accent);
  color: var(--cms-ink-inverse);
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.font-manager__submit:disabled {
  background: #a0b9d9;
  cursor: not-allowed;
}

.font-manager__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.font-manager__item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  background: var(--cms-canvas);
}

.font-manager__item-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.font-manager__item-name {
  font-size: 12px;
  color: var(--cms-ink-body);
}

.font-manager__item-detail {
  font-size: 11px;
  color: #777;
}

.font-manager__badge {
  font-size: 10px;
  color: var(--cms-accent);
  font-weight: 600;
}

.font-manager__delete {
  font-size: 11px;
  background: none;
  color: #c0392b;
  border: 1px solid #e0b2aa;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.font-manager__delete:disabled {
  color: var(--cms-ink-subtle);
  border-color: var(--cms-line);
  cursor: not-allowed;
}

.font-manager__empty {
  font-size: 11px;
  color: var(--cms-ink-subtle);
  text-align: center;
  padding: 12px;
  margin: 0;
}
</style>
